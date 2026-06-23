/**
 * Per-flight checked state. This is intentionally ephemeral and device-local:
 * it lives in localStorage keyed by aircraft id, and "Reset for new flight"
 * simply clears the key. It never touches the checklist JSON on the server.
 *
 * Shape stored: a record of `${sectionId}:${itemId}` -> true.
 */

export type CheckMap = Record<string, boolean>;

const keyFor = (aircraftId: string) => `flight-checklist:checks:${aircraftId}`;

export const checkKey = (sectionId: string, itemId: string) => `${sectionId}:${itemId}`;

export function loadChecks(aircraftId: string): CheckMap {
  try {
    const raw = localStorage.getItem(keyFor(aircraftId));
    return raw ? (JSON.parse(raw) as CheckMap) : {};
  } catch {
    return {};
  }
}

export function saveChecks(aircraftId: string, checks: CheckMap): void {
  try {
    // Drop false entries to keep the payload small.
    const trimmed: CheckMap = {};
    for (const [k, v] of Object.entries(checks)) if (v) trimmed[k] = true;
    localStorage.setItem(keyFor(aircraftId), JSON.stringify(trimmed));
  } catch {
    /* storage full or unavailable — non-fatal */
  }
}

export function clearChecks(aircraftId: string): void {
  try {
    localStorage.removeItem(keyFor(aircraftId));
  } catch {
    /* ignore */
  }
}
