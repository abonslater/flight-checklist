import { Link } from "react-router-dom";
import type { AircraftSummary } from "../lib/types";
import { backendUrl } from "../lib/config";

export default function AircraftCard({ aircraft }: { aircraft: AircraftSummary }) {
  return (
    <Link
      to={`/aircraft/${aircraft.id}`}
      className="touch-target group flex flex-col overflow-hidden rounded-2xl border border-cockpit-edge bg-cockpit-panel transition active:scale-[0.98]"
    >
      <div className="aspect-[16/10] w-full overflow-hidden bg-cockpit-bg">
        {aircraft.thumbnail ? (
          <img
            src={backendUrl(aircraft.thumbnail)}
            alt={`${aircraft.make} ${aircraft.model}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl text-slate-600">
            ✈
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="flex items-center gap-2 text-sm uppercase tracking-wide text-cockpit-accent">
          {aircraft.make}
          {aircraft.isTemplate && (
            <span className="rounded bg-cockpit-edge px-1.5 py-0.5 text-xs font-semibold text-slate-300">
              Template
            </span>
          )}
        </span>
        <span className="text-lg font-semibold leading-tight text-slate-100">
          {aircraft.model}
        </span>
        <span className="mt-auto pt-2 text-sm text-slate-400">
          {aircraft.sectionCount} sections · {aircraft.itemCount} items
        </span>
      </div>
    </Link>
  );
}
