import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createAircraft,
  deleteAircraft,
  getAircraft,
  listAircraft,
  updateAircraft,
  uploadAircraftPdf,
} from "../lib/api";
import type {
  Aircraft,
  AircraftSpecs,
  AircraftSummary,
  ChecklistItem,
  ChecklistSection,
} from "../lib/types";
import { SPEC_GROUPS, emptySpecs, hasAnySpecs } from "../lib/types";

// A locally-unique id for new sections/items. The server re-stamps ids on save,
// so these only need to be stable within this editing session.
let counter = 0;
const localId = (prefix: string) => `${prefix}-new-${counter++}`;

const emptyAircraft = (): Aircraft => ({
  id: "",
  make: "",
  model: "",
  thumbnail: "",
  isTemplate: false,
  specs: emptySpecs(),
  sections: [],
});

// Deep-copy a template's sections/items with fresh local ids, so the new
// checklist is fully editable and independent of the template.
function cloneSections(sections: ChecklistSection[]): ChecklistSection[] {
  return sections.map((s) => ({
    id: localId("section"),
    title: s.title,
    image: s.image,
    items: s.items.map((it) => ({
      id: localId("item"),
      label: it.label,
      detail: it.detail,
    })),
  }));
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = arr.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

// Mirror the server's slugify (server/index.js) so the editor can predict the image
// folder that will be created for a new aircraft from its make + model.
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Filenames in the shared "default" image folder; a new aircraft's folder is seeded
// with copies of these on save (server ensureImageFolder).
const DEFAULT_IMAGE_FILES = new Set([
  "pre-start.png",
  "startup.png",
  "before-taxi.png",
  "taxi.png",
  "before-take-off.png",
  "take-off.png",
  "climb-out.png",
  "cruise.png",
  "descent.png",
  "approach.png",
  "landing.png",
  "taxi-to-ramp.png",
  "shutdown.png",
  "thumb.png",
]);

// Pick the default image whose flight phase best matches a section title.
function pickDefaultImageFile(title: string): string {
  const t = title.toLowerCase();
  if (/shut\s*down|secure|parking/.test(t)) return "shutdown.png";
  if (/after\s*landing|ramp/.test(t)) return "taxi-to-ramp.png";
  if (/landing|final/.test(t)) return "landing.png";
  if (/approach/.test(t)) return "approach.png";
  if (/descen/.test(t)) return "descent.png";
  if (/cruise/.test(t)) return "cruise.png";
  if (/climb/.test(t)) return "climb-out.png";
  if (/before\s*take/.test(t)) return "before-take-off.png";
  if (/take\s*-?\s*off|takeoff|rotate|t\/o/.test(t)) return "take-off.png";
  if (/before\s*taxi/.test(t)) return "before-taxi.png";
  if (/taxi/.test(t)) return "taxi.png";
  if (/before\s*(engine\s*)?start|pre.?flight|pre.?start/.test(t)) return "pre-start.png";
  if (/start/.test(t)) return "startup.png";
  return "thumb.png";
}

const fileNameOf = (path: string) => path.split("/").pop() ?? "";

const inputCls =
  "w-full rounded-lg border border-cockpit-edge bg-cockpit-panel px-3 py-2 text-base text-slate-100 outline-none focus:border-cockpit-accent";

export default function EditorPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [draft, setDraft] = useState<Aircraft>(emptyAircraft);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Template picker (create flow only).
  const [templates, setTemplates] = useState<AircraftSummary[]>([]);
  const [templateId, setTemplateId] = useState("");

  // PDF import.
  const [importing, setImporting] = useState(false);
  // The imported PDF file, held until save so a copy can be stored on the server.
  const [pendingPdf, setPendingPdf] = useState<File | null>(null);

  useEffect(() => {
    if (!isEdit || !id) return;
    getAircraft(id)
      // Default specs for older files saved before the specs feature existed.
      .then((a) => setDraft({ ...a, specs: a.specs ?? emptySpecs() }))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  // For a new checklist, load the available templates to offer in the dropdown.
  useEffect(() => {
    if (isEdit) return;
    listAircraft()
      .then((all) => setTemplates(all.filter((a) => a.isTemplate)))
      .catch(() => setTemplates([]));
  }, [isEdit]);

  // The image folder that will be created for this aircraft: its slug while creating
  // (derived from make + model), or its existing id while editing.
  const folderId = isEdit ? id ?? "" : slugify(`${draft.make} ${draft.model}`);

  // Default and keep image paths pointed at that folder. Empty image fields are filled
  // with the flight-phase-matched default image; paths that already reference a default
  // image just have their folder kept in sync. Custom paths are left untouched.
  useEffect(() => {
    if (loading || !folderId) return;
    setDraft((d) => {
      let changed = false;
      const remap = (path: string, fallbackFile: string): string => {
        if (!path) {
          changed = true;
          return `/images/${folderId}/${fallbackFile}`;
        }
        if (DEFAULT_IMAGE_FILES.has(fileNameOf(path))) {
          const next = `/images/${folderId}/${fileNameOf(path)}`;
          if (next !== path) changed = true;
          return next;
        }
        return path;
      };
      const thumbnail = remap(d.thumbnail, "thumb.png");
      const sections = d.sections.map((s) => {
        const image = remap(s.image, pickDefaultImageFile(s.title));
        return image === s.image ? s : { ...s, image };
      });
      return changed ? { ...d, thumbnail, sections } : d;
    });
  }, [folderId, loading, draft.sections, draft.thumbnail]);

  // Prepopulate the draft's sections from the chosen template (keeps the user's
  // make/model and never marks the new checklist itself as a template). Image paths are
  // reset so they default to this aircraft's own folder (filled by the effect above).
  async function applyTemplate(tid: string) {
    setTemplateId(tid);
    if (!tid) return;
    try {
      const tpl = await getAircraft(tid);
      setDraft((d) => ({
        ...d,
        sections: cloneSections(tpl.sections).map((s) => ({ ...s, image: "" })),
      }));
    } catch (e) {
      setError(String(e));
    }
  }

  // Extract sections/items from a PDF checklist and prepopulate the draft. Best-effort:
  // make/model fill only if still blank, and existing sections are replaced (with a confirm).
  async function importFromPdf(file: File) {
    if (draft.sections.length > 0 && !confirm("Replace the current sections with the imported checklist?")) {
      return;
    }
    setImporting(true);
    setError(null);
    try {
      // Lazy-load the parser (and pdfjs) only when actually importing.
      const { importChecklistFromPdf } = await import("../lib/pdfImport");
      const parsed = await importChecklistFromPdf(file);
      if (parsed.sections.length === 0) {
        setError("No checklist sections were found in that PDF.");
        return;
      }
      setDraft((d) => ({
        ...d,
        make: d.make || parsed.make,
        model: d.model || parsed.model,
        specs: hasAnySpecs(parsed.specs) ? parsed.specs : d.specs,
        sections: cloneSections(parsed.sections),
      }));
      // Keep the file so a copy is stored on the server when the checklist is saved.
      setPendingPdf(file);
    } catch (e) {
      setError(`Could not import PDF: ${e}`);
    } finally {
      setImporting(false);
    }
  }

  function patch(p: Partial<Aircraft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function patchSection(si: number, p: Partial<ChecklistSection>) {
    setDraft((d) => {
      const sections = d.sections.slice();
      sections[si] = { ...sections[si], ...p };
      return { ...d, sections };
    });
  }

  function patchItem(si: number, ii: number, p: Partial<ChecklistItem>) {
    setDraft((d) => {
      const sections = d.sections.slice();
      const items = sections[si].items.slice();
      items[ii] = { ...items[ii], ...p };
      sections[si] = { ...sections[si], items };
      return { ...d, sections };
    });
  }

  function addSection() {
    setDraft((d) => ({
      ...d,
      sections: [
        ...d.sections,
        { id: localId("section"), title: "New section", image: "", items: [] },
      ],
    }));
  }

  function removeSection(si: number) {
    setDraft((d) => ({ ...d, sections: d.sections.filter((_, i) => i !== si) }));
  }

  function moveSection(si: number, dir: -1 | 1) {
    setDraft((d) => ({ ...d, sections: move(d.sections, si, si + dir) }));
  }

  function addItem(si: number) {
    setDraft((d) => {
      const sections = d.sections.slice();
      sections[si] = {
        ...sections[si],
        items: [...sections[si].items, { id: localId("item"), label: "", detail: "" }],
      };
      return { ...d, sections };
    });
  }

  function removeItem(si: number, ii: number) {
    setDraft((d) => {
      const sections = d.sections.slice();
      sections[si] = {
        ...sections[si],
        items: sections[si].items.filter((_, i) => i !== ii),
      };
      return { ...d, sections };
    });
  }

  function moveItem(si: number, ii: number, dir: -1 | 1) {
    setDraft((d) => {
      const sections = d.sections.slice();
      sections[si] = { ...sections[si], items: move(sections[si].items, ii, ii + dir) };
      return { ...d, sections };
    });
  }

  // --- Specifications (Weight / Dimensions / Performance / Speeds) ---
  const specsOf = (d: Aircraft) => d.specs ?? emptySpecs();

  function patchSpec(group: keyof AircraftSpecs, i: number, p: Partial<{ label: string; value: string }>) {
    setDraft((d) => {
      const specs = { ...specsOf(d) };
      const rows = specs[group].slice();
      rows[i] = { ...rows[i], ...p };
      specs[group] = rows;
      return { ...d, specs };
    });
  }

  function addSpec(group: keyof AircraftSpecs) {
    setDraft((d) => {
      const specs = { ...specsOf(d) };
      specs[group] = [...specs[group], { label: "", value: "" }];
      return { ...d, specs };
    });
  }

  function removeSpec(group: keyof AircraftSpecs, i: number) {
    setDraft((d) => {
      const specs = { ...specsOf(d) };
      specs[group] = specs[group].filter((_, idx) => idx !== i);
      return { ...d, specs };
    });
  }

  async function save() {
    if (!draft.make.trim() || !draft.model.trim()) {
      setError("Make and model are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let saved: Aircraft;
      if (isEdit && id) {
        saved = await updateAircraft(id, draft);
      } else {
        const { id: _omit, ...payload } = draft;
        saved = await createAircraft(payload);
      }
      // Store a copy of the imported PDF now that the aircraft id is known. Non-fatal:
      // a failed upload shouldn't block the (already-saved) checklist.
      if (pendingPdf) {
        try {
          await uploadAircraftPdf(saved.id, pendingPdf);
        } catch (uploadErr) {
          console.warn("Could not store imported PDF:", uploadErr);
        }
      }
      navigate(`/aircraft/${saved.id}`);
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  }

  async function remove() {
    if (!isEdit || !id) return;
    if (!confirm("Delete this aircraft checklist permanently?")) return;
    setSaving(true);
    try {
      await deleteAircraft(id);
      navigate("/");
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  }

  if (loading) return <p className="p-6 text-slate-400">Loading…</p>;

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <Link
          to={isEdit ? `/aircraft/${id}` : "/"}
          className="touch-target inline-flex items-center text-cockpit-accent"
        >
          ← Cancel
        </Link>
        <h1 className="text-lg font-bold sm:text-xl">
          {isEdit ? "Edit checklist" : "New checklist"}
        </h1>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="touch-target inline-flex items-center rounded-lg bg-cockpit-accent px-5 font-semibold text-cockpit-bg disabled:opacity-50 active:scale-95"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </header>

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-300">
          {error}
        </p>
      )}

      {/* Template picker (only when creating a new checklist) */}
      {!isEdit && templates.length > 0 && (
        <label className="flex flex-col gap-1 text-sm text-slate-400">
          Start from template
          <select
            className={inputCls}
            value={templateId}
            onChange={(e) => applyTemplate(e.target.value)}
          >
            <option value="">— None (blank checklist) —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.make} {t.model}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* PDF import — available when creating or editing a checklist */}
      <div className="flex flex-col gap-1 text-sm text-slate-400">
        Import from PDF
        <label
          className={`${inputCls} touch-target flex cursor-pointer items-center justify-center font-semibold text-cockpit-accent ${
            importing ? "opacity-50" : ""
          }`}
        >
          {importing ? "Importing…" : "Choose a PDF checklist…"}
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={importing}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // allow re-selecting the same file
              if (file) importFromPdf(file);
            }}
          />
        </label>
        <span className="text-xs text-slate-500">
          {isEdit
            ? "Best-effort import — this replaces the sections below."
            : "Best-effort import — review the sections below before saving."}
        </span>
      </div>

      {/* Aircraft fields */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-slate-400">
          Make
          <input
            className={inputCls}
            value={draft.make}
            onChange={(e) => patch({ make: e.target.value })}
            placeholder="Cessna"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-400">
          Model
          <input
            className={inputCls}
            value={draft.model}
            onChange={(e) => patch({ model: e.target.value })}
            placeholder="172 Skyhawk"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-400 sm:col-span-2">
          Thumbnail image path
          <input
            className={inputCls}
            value={draft.thumbnail}
            onChange={(e) => patch({ thumbnail: e.target.value })}
            placeholder="/images/cessna-172/thumb.png"
          />
        </label>
      </div>

      {/* Template flag */}
      <label className="flex items-center gap-3 text-slate-200">
        <input
          type="checkbox"
          checked={draft.isTemplate}
          onChange={(e) => patch({ isTemplate: e.target.checked })}
          className="h-5 w-5 accent-cockpit-accent"
        />
        <span>
          Mark as template
          <span className="block text-sm text-slate-400">
            Templates are hidden from the homepage and can be used to start new checklists.
          </span>
        </span>
      </label>

      {/* Sections */}
      <div className="flex flex-col gap-4">
        {draft.sections.map((section, si) => (
          <fieldset
            key={section.id}
            className="flex flex-col gap-3 rounded-2xl border border-cockpit-edge bg-cockpit-panel/60 p-4"
          >
            <div className="flex items-center gap-2">
              <input
                className={inputCls + " font-semibold"}
                value={section.title}
                onChange={(e) => patchSection(si, { title: e.target.value })}
                placeholder="Section title"
              />
              <button
                type="button"
                onClick={() => moveSection(si, -1)}
                className="touch-target rounded-lg border border-cockpit-edge px-3"
                aria-label="Move section up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveSection(si, 1)}
                className="touch-target rounded-lg border border-cockpit-edge px-3"
                aria-label="Move section down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeSection(si)}
                className="touch-target rounded-lg border border-red-500/40 px-3 text-red-300"
                aria-label="Delete section"
              >
                ✕
              </button>
            </div>

            <label className="flex flex-col gap-1 text-sm text-slate-400">
              Cockpit image path
              <input
                className={inputCls}
                value={section.image}
                onChange={(e) => patchSection(si, { image: e.target.value })}
                placeholder="/images/cessna-172/preflight.png"
              />
            </label>

            <div className="flex flex-col gap-2">
              {section.items.map((item, ii) => (
                <div key={item.id} className="flex items-center gap-2">
                  <input
                    className={inputCls}
                    value={item.label}
                    onChange={(e) => patchItem(si, ii, { label: e.target.value })}
                    placeholder="Item, e.g. Fuel selector"
                  />
                  <input
                    className={inputCls + " sm:max-w-[40%]"}
                    value={item.detail}
                    onChange={(e) => patchItem(si, ii, { detail: e.target.value })}
                    placeholder="Action, e.g. BOTH"
                  />
                  <button
                    type="button"
                    onClick={() => moveItem(si, ii, -1)}
                    className="touch-target rounded-lg border border-cockpit-edge px-2"
                    aria-label="Move item up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(si, ii, 1)}
                    className="touch-target rounded-lg border border-cockpit-edge px-2"
                    aria-label="Move item down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(si, ii)}
                    className="touch-target rounded-lg border border-red-500/40 px-2 text-red-300"
                    aria-label="Delete item"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addItem(si)}
                className="touch-target self-start rounded-lg border border-dashed border-cockpit-edge px-4 text-slate-300"
              >
                + Add item
              </button>
            </div>
          </fieldset>
        ))}

        <button
          type="button"
          onClick={addSection}
          className="touch-target rounded-xl border border-dashed border-cockpit-edge px-4 text-slate-200"
        >
          + Add section
        </button>
      </div>

      {/* Specifications: Weight / Dimensions / Performance / Speeds */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Specifications</h2>
        {SPEC_GROUPS.map((group) => {
          const rows = specsOf(draft)[group.key];
          return (
            <fieldset
              key={group.key}
              className="flex flex-col gap-2 rounded-2xl border border-cockpit-edge bg-cockpit-panel/60 p-4"
            >
              <legend className="px-1 text-sm font-semibold text-cockpit-accent">
                {group.title}
              </legend>
              {rows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className={inputCls}
                    value={row.label}
                    onChange={(e) => patchSpec(group.key, i, { label: e.target.value })}
                    placeholder="Spec, e.g. Wingspan"
                  />
                  <input
                    className={inputCls + " sm:max-w-[45%]"}
                    value={row.value}
                    onChange={(e) => patchSpec(group.key, i, { value: e.target.value })}
                    placeholder="Value, e.g. 38.7 ft (11.79 m)"
                  />
                  <button
                    type="button"
                    onClick={() => removeSpec(group.key, i)}
                    className="touch-target rounded-lg border border-red-500/40 px-2 text-red-300"
                    aria-label="Delete spec"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addSpec(group.key)}
                className="touch-target self-start rounded-lg border border-dashed border-cockpit-edge px-4 text-slate-300"
              >
                + Add row
              </button>
            </fieldset>
          );
        })}
      </div>

      {isEdit && (
        <button
          type="button"
          onClick={remove}
          className="touch-target mt-2 self-start rounded-lg border border-red-500/40 px-4 text-red-300"
        >
          Delete checklist
        </button>
      )}
    </div>
  );
}
