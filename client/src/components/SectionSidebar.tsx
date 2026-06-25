import type { ChecklistSection } from "../lib/types";
import type { CheckMap } from "../lib/checkState";
import { checkKey } from "../lib/checkState";

interface SectionSidebarProps {
  sections: ChecklistSection[];
  checks: CheckMap;
  /** Jump to the section in the checklist. */
  onSelect: (id: string) => void;
}

function sectionProgress(section: ChecklistSection, checks: CheckMap) {
  const total = section.items.length;
  const done = section.items.filter((it) => checks[checkKey(section.id, it.id)]).length;
  return { done, total };
}

export default function SectionSidebar({ sections, checks, onSelect }: SectionSidebarProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="px-1 text-xs uppercase tracking-wide text-slate-500">Sections</span>

      <nav className="flex gap-2 overflow-x-auto md:flex-col md:overflow-x-visible md:overflow-y-auto">
        {sections.map((section) => {
          const { done, total } = sectionProgress(section, checks);
          const complete = total > 0 && done === total;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              className="touch-target flex shrink-0 items-center gap-3 rounded-xl border border-cockpit-edge bg-cockpit-panel px-4 text-left text-slate-300 transition hover:border-cockpit-accent hover:text-slate-100 md:shrink"
            >
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
