// Base URL of the backend (API + image/PDF assets).
//
// - In local dev this is empty: Vite proxies "/api" to the Express server and serves
//   "/images" and "/pdfs" from client/public.
// - In production (e.g. the Vercel-hosted frontend), set VITE_API_BASE_URL at build time
//   to the deployed Express server's URL, e.g. "https://flight-checklist.onrender.com".
//   It is read by Vite and inlined into the build.
const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

export const API_BASE = base;

/** Resolve a server path ("/api/…", "/images/…", "/pdfs/…") against the backend base. */
export function backendUrl(path: string): string {
  if (!path || /^https?:\/\//i.test(path)) return path;
  return base + path;
}
