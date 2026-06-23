import type { ChecklistSection } from "../lib/types";
import type { CheckMap } from "../lib/checkState";
import { checkKey } from "../lib/checkState";

interface ChecklistItemsProps {
  section: ChecklistSection;
  checks: CheckMap;
  onToggle: (sectionId: string, itemId: string) => void;
}

export default function ChecklistItems({ section, checks, onToggle }: ChecklistItemsProps) {
  if (section.items.length === 0) {
    return <p className="text-slate-500">No items in this section.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {section.items.map((item) => {
        const key = checkKey(section.id, item.id);
        const checked = !!checks[key];
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onToggle(section.id, item.id)}
              className={[
                "touch-target flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition active:scale-[0.99]",
                checked
                  ? "border-cockpit-accent/50 bg-cockpit-accent/10"
                  : "border-cockpit-edge bg-cockpit-panel",
              ].join(" ")}
              aria-pressed={checked}
            >
              <span
                className={[
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-sm font-bold",
                  checked
                    ? "border-cockpit-accent bg-cockpit-accent text-cockpit-bg"
                    : "border-slate-500 text-transparent",
                ].join(" ")}
                aria-hidden
              >
                ✓
              </span>
              <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3">
                <span
                  className={[
                    "font-medium",
                    checked ? "text-slate-400 line-through" : "text-slate-100",
                  ].join(" ")}
                >
                  {item.label}
                </span>
                {item.detail && (
                  <span className="text-sm font-semibold uppercase tracking-wide text-cockpit-accent">
                    {item.detail}
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
