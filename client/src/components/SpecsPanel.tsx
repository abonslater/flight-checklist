import { useState } from "react";
import { Link } from "react-router-dom";
import type { AircraftSpecs } from "../lib/types";
import { SPEC_GROUPS, hasAnySpecs } from "../lib/types";

interface SpecsPanelProps {
  specs: AircraftSpecs;
  editHref: string;
}

// Expanded by default on tablet/desktop, collapsed on phones.
const initialExpanded = () =>
  typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

export default function SpecsPanel({ specs, editHref }: SpecsPanelProps) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const any = hasAnySpecs(specs);

  return (
    <aside className="rounded-2xl border border-cockpit-edge bg-cockpit-panel/60">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="touch-target flex w-full items-center justify-between gap-2 px-4 font-semibold"
      >
        <span>Specifications</span>
        <span aria-hidden className="text-cockpit-accent">
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-4 px-4 pb-4">
          {!any && (
            <p className="text-sm text-slate-400">
              No specifications.{" "}
              <Link to={editHref} className="text-cockpit-accent">
                Edit to add
              </Link>
              .
            </p>
          )}

          {any &&
            SPEC_GROUPS.map((group) => {
              const rows = specs[group.key];
              if (rows.length === 0) return null;
              return (
                <div key={group.key} className="flex flex-col gap-1">
                  <h3 className="text-sm uppercase tracking-wide text-cockpit-accent">
                    {group.title}
                  </h3>
                  <dl className="flex flex-col">
                    {rows.map((row, i) => (
                      <div
                        key={i}
                        className="flex justify-between gap-4 border-b border-cockpit-edge/50 py-1 last:border-0"
                      >
                        <dt className="text-slate-300">{row.label}</dt>
                        <dd className="text-right font-medium tabular-nums text-slate-100">
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
        </div>
      )}
    </aside>
  );
}
