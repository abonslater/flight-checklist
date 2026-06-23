interface FilterBarProps {
  makes: string[];
  make: string;
  model: string;
  onMakeChange: (make: string) => void;
  onModelChange: (model: string) => void;
}

export default function FilterBar({
  makes,
  make,
  model,
  onMakeChange,
  onModelChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <select
        value={make}
        onChange={(e) => onMakeChange(e.target.value)}
        className="touch-target rounded-lg border border-cockpit-edge bg-cockpit-panel px-4 text-base text-slate-100 outline-none focus:border-cockpit-accent"
        aria-label="Filter by make"
      >
        <option value="">All makes</option>
        {makes.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <input
        type="search"
        inputMode="search"
        value={model}
        onChange={(e) => onModelChange(e.target.value)}
        placeholder="Search model…"
        className="touch-target flex-1 rounded-lg border border-cockpit-edge bg-cockpit-panel px-4 text-base text-slate-100 outline-none placeholder:text-slate-500 focus:border-cockpit-accent"
        aria-label="Search by model"
      />
    </div>
  );
}
