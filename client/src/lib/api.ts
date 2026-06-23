import type { Aircraft, AircraftSummary } from "./types";
import { backendUrl } from "./config";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.error || detail;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function listAircraft(): Promise<AircraftSummary[]> {
  return fetch(backendUrl("/api/aircraft")).then((r) => handle<AircraftSummary[]>(r));
}

export function getAircraft(id: string): Promise<Aircraft> {
  return fetch(backendUrl(`/api/aircraft/${id}`)).then((r) => handle<Aircraft>(r));
}

export function createAircraft(data: Omit<Aircraft, "id">): Promise<Aircraft> {
  return fetch(backendUrl("/api/aircraft"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((r) => handle<Aircraft>(r));
}

export function updateAircraft(id: string, data: Aircraft): Promise<Aircraft> {
  return fetch(backendUrl(`/api/aircraft/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((r) => handle<Aircraft>(r));
}

export function deleteAircraft(id: string): Promise<void> {
  return fetch(backendUrl(`/api/aircraft/${id}`), { method: "DELETE" }).then((r) =>
    handle<void>(r)
  );
}

/** Upload a cockpit/thumbnail image for an aircraft; the server stores it and returns its path. */
export function uploadAircraftImage(id: string, file: File): Promise<{ path: string }> {
  return fetch(backendUrl(`/api/aircraft/${id}/image`), {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  }).then((r) => handle<{ path: string }>(r));
}

/** Upload the imported source PDF for an aircraft; the server stores it and records its path. */
export function uploadAircraftPdf(id: string, file: File): Promise<{ pdf: string }> {
  return fetch(backendUrl(`/api/aircraft/${id}/pdf`), {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: file,
  }).then((r) => handle<{ pdf: string }>(r));
}
