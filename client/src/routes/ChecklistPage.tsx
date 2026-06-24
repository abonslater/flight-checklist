import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getAircraft } from "../lib/api";
import type { Aircraft } from "../lib/types";
import {
  clearChecks,
  loadChecks,
  saveChecks,
  checkKey,
  type CheckMap,
} from "../lib/checkState";
import SectionSidebar from "../components/SectionSidebar";
import ChecklistItems from "../components/ChecklistItems";
import CockpitImage from "../components/CockpitImage";
import SpecsPanel from "../components/SpecsPanel";
import { emptySpecs } from "../lib/types";
import { backendUrl } from "../lib/config";

export default function ChecklistPage() {
  const { id = "" } = useParams();
  const [aircraft, setAircraft] = useState<Aircraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [checks, setChecks] = useState<CheckMap>({});

  useEffect(() => {
    getAircraft(id)
      .then((a) => {
        setAircraft(a);
        setSelectedIds(new Set(a.sections[0] ? [a.sections[0].id] : []));
        setChecks(loadChecks(id));
      })
      .catch((e) => setError(String(e)));
  }, [id]);

  // Persist check state whenever it changes.
  useEffect(() => {
    if (aircraft) saveChecks(id, checks);
  }, [checks, id, aircraft]);

  // Sections currently shown, kept in checklist order regardless of selection order.
  const selectedSections = useMemo(
    () => aircraft?.sections.filter((s) => selectedIds.has(s.id)) ?? [],
    [aircraft, selectedIds]
  );

  function toggleSection(sectionId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }
  function selectAllSections() {
    setSelectedIds(new Set(aircraft?.sections.map((s) => s.id) ?? []));
  }
  function clearSections() {
    setSelectedIds(new Set());
  }

  const overall = useMemo(() => {
    if (!aircraft) return { done: 0, total: 0 };
    let done = 0;
    let total = 0;
    for (const s of aircraft.sections) {
      for (const it of s.items) {
        total++;
        if (checks[checkKey(s.id, it.id)]) done++;
      }
    }
    return { done, total };
  }, [aircraft, checks]);

  function toggle(sectionId: string, itemId: string) {
    const key = checkKey(sectionId, itemId);
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function resetFlight() {
    if (confirm("Reset all checked items for a new flight?")) {
      clearChecks(id);
      setChecks({});
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Link to="/" className="text-cockpit-accent">
          ← Back
        </Link>
        <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-300">
          {error}
        </p>
      </div>
    );
  }

  if (!aircraft) {
    return <p className="p-6 text-slate-400">Loading…</p>;
  }

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col px-4 py-4 sm:px-6">
      <header className="flex flex-col gap-3 border-b border-cockpit-edge pb-4">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="touch-target inline-flex items-center text-cockpit-accent">
            ← All aircraft
          </Link>
          <div className="flex items-center gap-2">
            {aircraft.pdf && (
              <a
                href={backendUrl(aircraft.pdf)}
                target="_blank"
                rel="noopener noreferrer"
                className="touch-target inline-flex items-center rounded-lg border border-cockpit-edge px-4 text-cockpit-accent"
              >
                Open PDF
              </a>
            )}
            <Link
              to={`/aircraft/${id}/edit`}
              className="touch-target inline-flex items-center rounded-lg border border-cockpit-edge px-4 text-slate-200"
            >
              Edit
            </Link>
            <button
              type="button"
              onClick={resetFlight}
              className="touch-target inline-flex items-center rounded-lg bg-cockpit-accent px-4 font-semibold text-cockpit-bg active:scale-95"
            >
              Reset flight
            </button>
          </div>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-wide text-cockpit-accent">
              {aircraft.make}
            </p>
            <h1 className="text-xl font-bold sm:text-2xl">{aircraft.model}</h1>
          </div>
          <p className="text-sm text-slate-400 tabular-nums">
            {overall.done}/{overall.total} complete
          </p>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 pt-4 md:grid md:grid-cols-[16rem_1fr] md:gap-6 lg:grid-cols-[16rem_1fr_20rem]">
        {/* Left pane: sections */}
        <aside className="md:scroll-y md:max-h-[calc(100vh-12rem)]">
          <SectionSidebar
            sections={aircraft.sections}
            selectedIds={selectedIds}
            checks={checks}
            onToggle={toggleSection}
            onSelectAll={selectAllSections}
            onClear={clearSections}
          />
        </aside>

        {/* Main: cockpit image + items for each selected section, stacked */}
        <main className="flex flex-col gap-8">
          {selectedSections.length > 0 ? (
            selectedSections.map((section) => (
              <section key={section.id} className="flex flex-col gap-4">
                <h2 className="text-lg font-semibold">{section.title}</h2>
                <CockpitImage
                  src={section.image}
                  alt={`${aircraft.make} ${aircraft.model} — ${section.title}`}
                />
                <ChecklistItems section={section} checks={checks} onToggle={toggle} />
              </section>
            ))
          ) : (
            <p className="text-slate-500">
              Select one or more sections from the left to view them.
            </p>
          )}
        </main>

        {/* Right pane: aircraft specifications (collapsible). Full-width below on
            phone/tablet; at lg it's the right column and stays pinned while the
            checklist scrolls (self-start keeps the grid cell from stretching so
            sticky engages; it scrolls internally if the specs are long). */}
        <div className="md:col-span-2 lg:col-span-1 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <SpecsPanel
            specs={aircraft.specs ?? emptySpecs()}
            editHref={`/aircraft/${id}/edit`}
          />
        </div>
      </div>
    </div>
  );
}
