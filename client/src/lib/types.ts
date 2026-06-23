export interface ChecklistItem {
  id: string;
  label: string;
  /** The action/value, e.g. "REMOVE", "SET 2200 RPM". */
  detail: string;
}

export interface ChecklistSection {
  id: string;
  title: string;
  /** Path to a bundled cockpit reference image, e.g. "/images/cessna-172/panel.png". */
  image: string;
  items: ChecklistItem[];
}

/** A single reference specification, e.g. { label: "Wingspan", value: "38.7 ft (11.79 m)" }. */
export interface SpecEntry {
  label: string;
  value: string;
}

/** Reference specifications shown in the checklist view's right pane. */
export interface AircraftSpecs {
  weight: SpecEntry[];
  dimensions: SpecEntry[];
  performance: SpecEntry[];
  speeds: SpecEntry[];
}

/** The fixed spec groups, in display order. The keys match AircraftSpecs. */
export const SPEC_GROUPS: { key: keyof AircraftSpecs; title: string }[] = [
  { key: "weight", title: "Weight" },
  { key: "dimensions", title: "Dimensions" },
  { key: "performance", title: "Performance" },
  { key: "speeds", title: "Speeds" },
];

export const emptySpecs = (): AircraftSpecs => ({
  weight: [],
  dimensions: [],
  performance: [],
  speeds: [],
});

/** True if any spec group has at least one entry. */
export const hasAnySpecs = (specs?: AircraftSpecs): boolean =>
  !!specs && SPEC_GROUPS.some((g) => specs[g.key].length > 0);

export interface Aircraft {
  id: string;
  make: string;
  model: string;
  thumbnail: string;
  /** When true, this checklist is a reusable template and is hidden from the homepage by default. */
  isTemplate: boolean;
  /** Reference specs. Optional for backward-compatibility with older saved files. */
  specs?: AircraftSpecs;
  /** Path to the imported source PDF, e.g. "/pdfs/cessna-172.pdf". Empty/absent if none. */
  pdf?: string;
  sections: ChecklistSection[];
}

/** Summary shape returned by GET /api/aircraft for the homepage grid. */
export interface AircraftSummary {
  id: string;
  make: string;
  model: string;
  thumbnail: string;
  isTemplate: boolean;
  sectionCount: number;
  itemCount: number;
}
