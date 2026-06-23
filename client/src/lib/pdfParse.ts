import type { AircraftSpecs, ChecklistSection } from "./types";

const emptySpecs = (): AircraftSpecs => ({
  weight: [],
  dimensions: [],
  performance: [],
  speeds: [],
});

/**
 * Pure parsing logic for the ObiOne MSFS checklist guide layout — no pdfjs/DOM
 * dependencies, so it can be unit-tested in Node. `pdfImport.ts` does the
 * pdfjs extraction and hands the raw tokens here.
 *
 * Layout: a two-column page where each section is a bordered table with a
 * centered header and rows of `label .... ACTION` (action right-aligned).
 */

export interface PdfToken {
  x: number; // text item x (transform[4])
  y: number; // text item y (transform[5]); PDF origin is bottom-left
  w: number; // text item width
  str: string;
}

export interface PdfPage {
  width: number;
  height: number;
  tokens: PdfToken[]; // ALL non-empty text tokens (margins not yet stripped)
}

export interface ParsedChecklist {
  make: string;
  model: string;
  specs: AircraftSpecs;
  sections: ChecklistSection[];
}

// Reference-table headers (before the START_MARKER) mapped to AircraftSpecs keys.
const SPEC_HEADERS: Record<string, keyof AircraftSpecs> = {
  weight: "weight",
  dimensions: "dimensions",
  performance: "performance",
  speeds: "speeds",
};

/** Tuning constants — adjust here if a similar PDF parses poorly. */
export const TUNING = {
  // Two text items are on the same visual row if their baselines (y) are within this many units.
  rowYTolerance: 4,
  // A horizontal gap (units) larger than this between consecutive tokens splits label | value.
  labelValueGap: 18,
  // A row is a centered section header if its left edge sits this far (fraction of
  // column width) from the column's content-left margin.
  centeredIndentFraction: 0.18,
  // Margin bands (fraction of page height) whose rows are page header/footer chrome.
  topMarginFraction: 0.07,
  bottomMarginFraction: 0.06,
};

// Marker that precedes the real checklist content; everything before it is reference data.
const START_MARKER = "NORMAL PROCEDURES";

// Header/footer chrome to drop wherever it appears.
const CHROME_RE =
  /^(FOR FLIGHTSIMULATOR USE ONLY|Checklists & Procedures|Guide\b.*|by ObiOne.*|\d+)$/i;

interface Row {
  y: number;
  tokens: PdfToken[];
  text: string; // all tokens joined left-to-right
  minX: number;
  maxX: number;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Group a column's tokens (already filtered to one column) into visual rows, top-to-bottom. */
function buildRows(tokens: PdfToken[]): Row[] {
  // PDF y origin is bottom-left, so top-to-bottom = descending y.
  const sorted = [...tokens].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Row[] = [];
  let current: PdfToken[] = [];
  let currentY = Number.NaN;

  const flush = () => {
    if (!current.length) return;
    const ordered = [...current].sort((a, b) => a.x - b.x);
    const text = clean(ordered.map((t) => t.str).join(" "));
    if (text) {
      const last = ordered[ordered.length - 1];
      rows.push({ y: currentY, tokens: ordered, text, minX: ordered[0].x, maxX: last.x + last.w });
    }
    current = [];
  };

  for (const t of sorted) {
    if (current.length && Math.abs(t.y - currentY) > TUNING.rowYTolerance) flush();
    if (!current.length) currentY = t.y;
    current.push(t);
  }
  flush();
  return rows;
}

/** Split a token list into a label group and a right-aligned value group at the largest gap. */
function splitTokens(tokens: PdfToken[]): { label: string; detail: string } | null {
  let gapIdx = -1;
  let gapSize = 0;
  for (let i = 1; i < tokens.length; i++) {
    const prev = tokens[i - 1];
    const gap = tokens[i].x - (prev.x + prev.w);
    if (gap > gapSize) {
      gapSize = gap;
      gapIdx = i;
    }
  }
  if (gapIdx === -1 || gapSize < TUNING.labelValueGap) return null;
  const label = clean(tokens.slice(0, gapIdx).map((t) => t.str).join(" "));
  const detail = clean(tokens.slice(gapIdx).map((t) => t.str).join(" "));
  if (!label || !detail) return null;
  return { label, detail };
}

const splitLabelValue = (row: Row) => splitTokens(row.tokens);

/** Heuristic: a single, horizontally-centered, ALL-CAPS group of text (a colored banner). */
function isSectionHeader(row: Row, colLeft: number, colWidth: number): boolean {
  if (colWidth <= 0 || row.text.length > 40) return false;
  const indent = (row.minX - colLeft) / colWidth;
  if (indent < TUNING.centeredIndentFraction) return false;
  // Section banners are ALL CAPS; this rejects centered italic sub-labels/notes inside
  // tables (e.g. "After rotate", "Transition Altitude", "(if ice on airframe) 50%").
  const letters = row.text.replace(/[^A-Za-z]/g, "");
  return letters.length > 0 && letters === letters.toUpperCase();
}

function titleCaseLabel(s: string): string {
  // Source labels are ALL CAPS; convert to a friendlier "Sentence case" for the label.
  // Detail/action text is kept verbatim.
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Build a checklist from the extracted PDF pages. */
export function buildChecklist(pages: PdfPage[]): ParsedChecklist {
  let make = "";
  let model = "";
  const sections: ChecklistSection[] = [];
  const specs = emptySpecs();
  // Speeds is a two-column table; collect its tokens and split into sub-columns afterwards.
  const speedsTokens: PdfToken[] = [];
  let currentSpecKey: keyof AircraftSpecs | null = null;
  let started = false;

  const lastSection = (): ChecklistSection | undefined => sections[sections.length - 1];
  const pushSection = (title: string) => sections.push({ id: "", title, image: "", items: [] });
  const pushItem = (label: string, detail: string) => {
    const s = lastSection();
    if (s) s.items.push({ id: "", label, detail });
  };

  pages.forEach((page, pageIndex) => {
    const midX = page.width / 2;
    const topY = page.height * (1 - TUNING.topMarginFraction);
    const bottomY = page.height * TUNING.bottomMarginFraction;

    // Title → make/model from the topmost token on page 1 (before margin filtering).
    if (pageIndex === 0 && !make) {
      const titleToken = [...page.tokens]
        .filter((t) => t.str.trim())
        .sort((a, b) => b.y - a.y)[0];
      if (titleToken) {
        const title = clean(titleToken.str);
        const sp = title.indexOf(" ");
        if (sp > 0) {
          make = title.slice(0, sp);
          model = title.slice(sp + 1);
        } else {
          model = title;
        }
      }
    }

    // Strip header/footer margin bands.
    const content = page.tokens.filter((t) => t.str.trim() && t.y <= topY && t.y >= bottomY);

    // Left column then right column, each top-to-bottom.
    const columns = [content.filter((t) => t.x < midX), content.filter((t) => t.x >= midX)];

    for (const colTokens of columns) {
      if (!colTokens.length) continue;
      const colLeft = Math.min(...colTokens.map((t) => t.x));
      const colRight = Math.max(...colTokens.map((t) => t.x + t.w));
      const colWidth = colRight - colLeft;

      for (const row of buildRows(colTokens)) {
        const text = row.text;

        if (!started) {
          if (text.toUpperCase() === START_MARKER) {
            started = true;
            currentSpecKey = null;
            continue;
          }
          // Reference tables (Weight/Dimensions/Performance/Speeds) precede the marker.
          const specKey = SPEC_HEADERS[text.toLowerCase()];
          if (specKey) {
            currentSpecKey = specKey;
            continue;
          }
          if (!currentSpecKey || CHROME_RE.test(text)) continue;
          if (currentSpecKey === "speeds") {
            speedsTokens.push(...row.tokens); // resolved into sub-columns after all pages
          } else {
            const lv = splitTokens(row.tokens);
            if (lv) specs[currentSpecKey].push({ label: lv.label, value: lv.detail });
          }
          continue;
        }
        if (CHROME_RE.test(text)) continue;

        const lv = splitLabelValue(row);
        if (lv) {
          pushItem(titleCaseLabel(lv.label), lv.detail);
        } else if (isSectionHeader(row, colLeft, colWidth)) {
          pushSection(titleCaseLabel(text));
        } else {
          // Continuation / sub-bullet line — append to the previous item's detail.
          const s = lastSection();
          if (s && s.items.length) {
            const last = s.items[s.items.length - 1];
            last.detail = clean(`${last.detail} ${text}`);
          }
        }
      }
    }
  });

  // Resolve the Speeds two-column table: split its tokens at their x-midpoint into a left
  // and right sub-column, then read each sub-column's rows as label/value pairs.
  if (speedsTokens.length) {
    const minX = Math.min(...speedsTokens.map((t) => t.x));
    const maxX = Math.max(...speedsTokens.map((t) => t.x + t.w));
    const subMid = (minX + maxX) / 2;
    for (const half of [
      speedsTokens.filter((t) => t.x < subMid),
      speedsTokens.filter((t) => t.x >= subMid),
    ]) {
      for (const row of buildRows(half)) {
        const lv = splitTokens(row.tokens);
        if (lv) specs.speeds.push({ label: lv.label, value: lv.detail });
      }
    }
  }

  // Drop empty sections that may result from stray headers.
  return { make, model, specs, sections: sections.filter((s) => s.items.length > 0) };
}
