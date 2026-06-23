import express from "express";
import cors from "cors";
import { readFile, writeFile, readdir, unlink, access, mkdir, cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const CLIENT_DIST = path.join(__dirname, "..", "client", "dist");
// Cockpit images live in the client's public folder, one subfolder per aircraft id.
const IMAGES_DIR = path.join(__dirname, "..", "client", "public", "images");
const DEFAULT_IMAGES_DIR = path.join(IMAGES_DIR, "default");
// Imported source PDFs are stored here, one file per aircraft: <id>.pdf.
const PDFS_DIR = path.join(__dirname, "..", "client", "public", "pdfs");
const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Aircraft ids are slugs: lowercase letters, numbers, and hyphens only.
// This regex is the path-traversal guard — any id with a slash, dot, etc. is rejected.
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function isValidId(id) {
  return typeof id === "string" && id.length <= 100 && SLUG_RE.test(id);
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fileFor(id) {
  return path.join(DATA_DIR, `${id}.json`);
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function readAircraft(id) {
  const raw = await readFile(fileFor(id), "utf8");
  return JSON.parse(raw);
}

async function writeAircraft(aircraft) {
  await writeFile(fileFor(aircraft.id), JSON.stringify(aircraft, null, 2) + "\n", "utf8");
}

// Ensure an image folder exists for this aircraft. If it's missing, create it and
// prepopulate it with the contents of the "default" folder so a new checklist starts
// with reference images. No-op if the folder already exists. Returns true if created.
async function ensureImageFolder(id) {
  const target = path.join(IMAGES_DIR, id);
  if (await exists(target)) return false;
  if (await exists(DEFAULT_IMAGES_DIR)) {
    // Recursive copy of every default image into the new aircraft folder.
    await cp(DEFAULT_IMAGES_DIR, target, { recursive: true });
  } else {
    await mkdir(target, { recursive: true });
  }
  return true;
}

// Normalize an incoming aircraft payload, ensuring stable ids on sections/items.
function normalize(body, id) {
  const sections = Array.isArray(body.sections) ? body.sections : [];
  return {
    id,
    make: String(body.make || "").trim(),
    model: String(body.model || "").trim(),
    thumbnail: body.thumbnail ? String(body.thumbnail) : "",
    isTemplate: Boolean(body.isTemplate),
    pdf: body.pdf ? String(body.pdf) : "",
    specs: ["weight", "dimensions", "performance", "speeds"].reduce((acc, k) => {
      const arr = Array.isArray(body.specs?.[k]) ? body.specs[k] : [];
      acc[k] = arr
        .map((e) => ({ label: String(e.label || "").trim(), value: String(e.value || "").trim() }))
        .filter((e) => e.label || e.value);
      return acc;
    }, {}),
    sections: sections.map((s, si) => ({
      id: isValidId(s.id) ? s.id : `section-${si + 1}`,
      title: String(s.title || "").trim(),
      image: s.image ? String(s.image) : "",
      items: (Array.isArray(s.items) ? s.items : []).map((it, ii) => ({
        id: isValidId(it.id) ? it.id : `item-${si + 1}-${ii + 1}`,
        label: String(it.label || "").trim(),
        detail: it.detail ? String(it.detail) : "",
      })),
    })),
  };
}

// GET /api/aircraft — summary list for the homepage grid.
app.get("/api/aircraft", async (_req, res) => {
  try {
    const files = (await readdir(DATA_DIR)).filter((f) => f.endsWith(".json"));
    const list = [];
    for (const f of files) {
      try {
        const a = JSON.parse(await readFile(path.join(DATA_DIR, f), "utf8"));
        list.push({
          id: a.id,
          make: a.make,
          model: a.model,
          thumbnail: a.thumbnail || "",
          isTemplate: Boolean(a.isTemplate),
          sectionCount: Array.isArray(a.sections) ? a.sections.length : 0,
          itemCount: Array.isArray(a.sections)
            ? a.sections.reduce((n, s) => n + (s.items?.length || 0), 0)
            : 0,
        });
      } catch {
        // skip malformed file
      }
    }
    list.sort((a, b) => `${a.make} ${a.model}`.localeCompare(`${b.make} ${b.model}`));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: "Failed to read aircraft list", detail: String(err) });
  }
});

// GET /api/aircraft/:id — full checklist.
app.get("/api/aircraft/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Invalid aircraft id" });
  if (!(await exists(fileFor(id)))) return res.status(404).json({ error: "Not found" });
  try {
    res.json(await readAircraft(id));
  } catch (err) {
    res.status(500).json({ error: "Failed to read aircraft", detail: String(err) });
  }
});

// POST /api/aircraft — create. Id derived from make + model.
app.post("/api/aircraft", async (req, res) => {
  const body = req.body || {};
  const make = String(body.make || "").trim();
  const model = String(body.model || "").trim();
  if (!make || !model) return res.status(400).json({ error: "make and model are required" });

  const baseId = slugify(`${make} ${model}`);
  if (!isValidId(baseId)) return res.status(400).json({ error: "Could not derive a valid id" });

  // Avoid clobbering an existing aircraft: suffix -2, -3, ... if needed.
  let id = baseId;
  let n = 2;
  while (await exists(fileFor(id))) {
    id = `${baseId}-${n++}`;
  }

  try {
    const aircraft = normalize(body, id);
    // The editor defaults image paths to /images/<baseId>/… (the slug it can predict).
    // If a collision bumped the real id, repoint those paths at the folder we'll create.
    if (id !== baseId) {
      const from = `/images/${baseId}/`;
      const to = `/images/${id}/`;
      if (aircraft.thumbnail.startsWith(from)) {
        aircraft.thumbnail = to + aircraft.thumbnail.slice(from.length);
      }
      for (const s of aircraft.sections) {
        if (s.image.startsWith(from)) s.image = to + s.image.slice(from.length);
      }
    }
    await writeAircraft(aircraft);
    // Seed an image folder from the "default" set. Non-fatal: a failure here
    // shouldn't reject an otherwise-successful save.
    try {
      await ensureImageFolder(id);
    } catch (imgErr) {
      console.warn(`Could not create image folder for ${id}:`, imgErr);
    }
    res.status(201).json(aircraft);
  } catch (err) {
    res.status(500).json({ error: "Failed to create aircraft", detail: String(err) });
  }
});

// PUT /api/aircraft/:id — overwrite an existing aircraft.
app.put("/api/aircraft/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Invalid aircraft id" });
  if (!(await exists(fileFor(id)))) return res.status(404).json({ error: "Not found" });
  const body = req.body || {};
  if (!String(body.make || "").trim() || !String(body.model || "").trim()) {
    return res.status(400).json({ error: "make and model are required" });
  }
  try {
    const aircraft = normalize(body, id);
    await writeAircraft(aircraft);
    res.json(aircraft);
  } catch (err) {
    res.status(500).json({ error: "Failed to update aircraft", detail: String(err) });
  }
});

// DELETE /api/aircraft/:id
app.delete("/api/aircraft/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Invalid aircraft id" });
  if (!(await exists(fileFor(id)))) return res.status(404).json({ error: "Not found" });
  try {
    await unlink(fileFor(id));
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete aircraft", detail: String(err) });
  }
});

// POST /api/aircraft/:id/pdf — store the imported source PDF (raw application/pdf body)
// and record its path on the aircraft.
app.post(
  "/api/aircraft/:id/pdf",
  express.raw({ type: "application/pdf", limit: "25mb" }),
  async (req, res) => {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: "Invalid aircraft id" });
    if (!(await exists(fileFor(id)))) return res.status(404).json({ error: "Not found" });
    if (!req.body || !req.body.length) return res.status(400).json({ error: "Empty PDF body" });
    try {
      await mkdir(PDFS_DIR, { recursive: true });
      await writeFile(path.join(PDFS_DIR, `${id}.pdf`), req.body);
      const aircraft = await readAircraft(id);
      aircraft.pdf = `/pdfs/${id}.pdf`;
      await writeAircraft(aircraft);
      res.json({ pdf: aircraft.pdf });
    } catch (err) {
      res.status(500).json({ error: "Failed to store PDF", detail: String(err) });
    }
  }
);

// Serve images and stored PDFs from the writable public folders. This covers both the
// seed assets and anything created at runtime, and lets a separately-hosted frontend
// (e.g. on Vercel) load them cross-origin. In local dev Vite serves these from public/.
app.use("/images", express.static(IMAGES_DIR));
app.use("/pdfs", express.static(PDFS_DIR));

// Serve the built client in production (single-process deploy).
app.use(express.static(CLIENT_DIST));
app.get(/^(?!\/api).*/, async (_req, res) => {
  const indexHtml = path.join(CLIENT_DIST, "index.html");
  if (await exists(indexHtml)) return res.sendFile(indexHtml);
  res.status(404).send("Client not built. Run `npm run build`.");
});

app.listen(PORT, () => {
  console.log(`Flight checklist API listening on http://localhost:${PORT}`);
});
