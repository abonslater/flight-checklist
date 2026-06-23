import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listAircraft } from "../lib/api";
import type { AircraftSummary } from "../lib/types";
import AircraftCard from "../components/AircraftCard";
import FilterBar from "../components/FilterBar";

export default function HomePage() {
  const [aircraft, setAircraft] = useState<AircraftSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");

  useEffect(() => {
    listAircraft()
      .then(setAircraft)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const makes = useMemo(
    () => Array.from(new Set(aircraft.map((a) => a.make))).sort(),
    [aircraft]
  );

  const filtered = useMemo(() => {
    const q = model.trim().toLowerCase();
    return aircraft.filter(
      (a) => (!make || a.make === make) && (!q || a.model.toLowerCase().includes(q))
    );
  }, [aircraft, make, model]);

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">MSFS 2024 Checklists</h1>
          <p className="text-slate-400">Pilot checklists by aircraft</p>
        </div>
        <Link
          to="/aircraft/new"
          className="touch-target inline-flex items-center justify-center rounded-lg bg-cockpit-accent px-5 font-semibold text-cockpit-bg transition active:scale-95"
        >
          + New checklist
        </Link>
      </header>

      <FilterBar
        makes={makes}
        make={make}
        model={model}
        onMakeChange={setMake}
        onModelChange={setModel}
      />

      {loading && <p className="py-12 text-center text-slate-400">Loading…</p>}
      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-300">
          {error}
        </p>
      )}

      {!loading && !error && filtered.length === 0 && (
        <p className="py-12 text-center text-slate-400">
          No aircraft match. Try clearing the filters or create a new checklist.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((a) => (
          <AircraftCard key={a.id} aircraft={a} />
        ))}
      </div>
    </div>
  );
}
