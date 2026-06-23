import express from "express";
import cors from "cors";
import { readFile, writeFile, readdir, unlink, access, mkdir, cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, "..", "client", "dist");

// Bundled seed content shipped in the repo. When a persistent volume is used, these are
// copied into it on first boot so the app isn't empty.
const SEED_DATA_DIR = path.join(__dirname, "data");
const SEED_IMAGES_DIR = path.join(__dirname, "..", "client", "public", "images");
const SEED_PDFS_DIR = path.join(__dirname, "..", "client", "public", "pdfs");

// Storage locations. Set STORAGE_DIR (e.g. a Railway volume mounted at /data) to persist
// created checklists, images, and PDFs across redeploys; it places everything under
// <STORAGE_DIR>/{data,images,pdfs}. Individual dirs can also be overridden directly.
// With nothing set, storage defaults to the bundled repo folders (local dev / single host).
const STORAGE_DIR = process.env.STORAGE_DIR || "";
const DATA_DIR =
  process.env.DATA_DIR || (STORAGE_DIR ? path.join(STORAGE_DIR, "data") : SEED_DATA_DIR);
const IMAGES_DIR =
  process.env.IMAGES_DIR || (STORAGE_DIR ? path.join(STORAGE_DIR, "images") : SEED_IMAGES_DIR);
const PDFS_DIR =
  process.env.PDFS_DIR || (STORAGE_DIR ? path.join(STORAGE_DIR, "pdfs") : SEED_PDFS_DIR);
// New aircraft image folders are seeded from this "default" set inside IMAGES_DIR.
const DEFAULT_IMAGES_DIR = path.join(IMAGES_DIR, "default");
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

async function isEmptyDir(dir) {
  try {
    return (await readdir(dir)).length === 0;
  } catch {
    return true; // missing dir counts as empty
  }
}

// Copy bundled seed content into a (different) storage dir the first time it's empty, so a
// freshly-mounted volume isn't blank. Never overwrites existing data on later boots.
async function seedDir(seedSrc, dest) {
  if (path.resolve(seedSrc) === path.resolve(dest)) return; // no storage override → no-op
  if (!(await exists(seedSrc))) return;
  await mkdir(dest, { recursive: true });
  if (!(await isEmptyDir(dest))) return; // already has data — leave it alone
  await cp(seedSrc, dest, { recursive: true });
  console.log(`Seeded ${dest} from bundled ${path.basename(seedSrc)}`);
}

async function initStorage() {
  // Ensure target dirs exist, then seed them from the repo on first run.
  await mkdir(DATA_DIR, { recursive: true });
  await seedDir(SEED_DATA_DIR, DATA_DIR);
  await seedDir(SEED_IMAGES_DIR, IMAGES_DIR);
  await seedDir(SEED_PDFS_DIR, PDFS_DIR);
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

initStorage()
  .catch((err) => console.warn("Storage init/seed warning:", err))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Flight checklist API listening on http://localhost:${PORT}`);
      console.log(`  data:   ${DATA_DIR}`);
      console.log(`  images: ${IMAGES_DIR}`);
      console.log(`  pdfs:   ${PDFS_DIR}`);
    });
  });
