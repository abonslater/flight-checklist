import type { ChecklistSection } from "../lib/types";
import type { CheckMap } from "../lib/checkState";
import { checkKey } from "../lib/checkState";

interface SectionSidebarProps {
  sections: ChecklistSection[];
  selectedIds: Set<string>;
  checks: CheckMap;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}

function sectionProgress(section: ChecklistSection, checks: CheckMap) {
  const total = section.items.length;
  const done = section.items.filter((it) => checks[checkKey(section.id, it.id)]).length;
  return { done, total };
}

export default function SectionSidebar({
  sections,
  selectedIds,
  checks,
  onToggle,
  onSelectAll,
  onClear,
}: SectionSidebarProps) {
  const allSelected = sections.length > 0 && sections.every((s) => selectedIds.has(s.id));

  return (
    <div className="flex flex-col gap-2">
      {/* Select-all / clear toolbar */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs uppercase tracking-wide text-slate-500">Sections</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            disabled={allSelected}
            className="rounded px-2 py-1 text-xs text-cockpit-accent disabled:opacity-40"
          >
            All
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={selectedIds.size === 0}
            className="rounded px-2 py-1 text-xs text-slate-400 disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>

      <nav className="flex gap-2 overflow-x-auto md:flex-col md:overflow-x-visible md:overflow-y-auto">
        {sections.map((section) => {
          const { done, total } = sectionProgress(section, checks);
          const complete = total > 0 && done === total;
          const selected = selectedIds.has(section.id);
          return (
            <button
              key={section.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onToggle(section.id)}
              className={[
                "touch-target flex shrink-0 items-center gap-3 rounded-xl border px-4 text-left md:shrink",
                selected
                  ? "border-cockpit-accent bg-cockpit-accent/10 text-slate-100"
                  : "border-cockpit-edge bg-cockpit-panel text-slate-300",
              ].join(" ")}
            >
              {/* Checkbox-style indicator makes multi-select obvious */}
              <span
                className={[
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold",
                  selected
                    ? "border-cockpit-accent bg-cockpit-accent text-cockpit-bg"
                    : "border-slate-500 text-transparent",
                ].join(" ")}
                aria-hidden
              >
                ✓
              </span>
              <span className="flex-1 font-medium">{section.title}</span>
              <span
                className={[
                  "rounded-full px-2 py-0.5 text-xs tabular-nums",
                  complete
                    ? "bg-cockpit-accent text-cockpit-bg"
                    : "bg-cockpit-edge text-slate-300",
                ].join(" ")}
              >
                {done}/{total}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
