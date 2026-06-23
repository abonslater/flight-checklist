# MSFS 2024 Flight Checklists

A touch-friendly web app (optimized for iPad/iPhone) for creating and viewing pilot
checklists for Microsoft Flight Simulator 2024 aircraft.

- **Frontend**: React + TypeScript + Vite + Tailwind CSS (`client/`)
- **Backend**: Node + Express, reads/writes one JSON file per aircraft (`server/`)

## Features

- Homepage grid of all aircraft with **make** filter and **model** search.
- Per-aircraft checklist organized into **sections** (left pane) with a **cockpit
  reference image** per section (tap to zoom).
- **Check off** items during a flight; per-section and overall progress. Checked state
  is stored per-device in `localStorage` and cleared by **Reset flight** — it never
  alters the saved checklist.
- **Create / edit / delete** checklists in-app; changes persist to the JSON files on disk
  via the backend API.

## Setup

```bash
npm run install:all   # installs root, server, and client deps
npm run dev           # starts API (:3001) and Vite client (:5173) together
```

Open http://localhost:5173. Vite also binds to your LAN address (shown on start), so a
real iPad/iPhone on the same network can connect and "Add to Home Screen".

## Production (single host)

```bash
npm run build   # builds the client into client/dist
npm start       # Express serves the API + the built client on :3001
```

## Deploying the frontend to Vercel (backend hosted separately)

Vercel is serverless with a **read-only filesystem**, so the Express backend (which writes
checklist JSON, images, and PDFs to disk) cannot run there. Deploy the two parts separately:

1. **Backend** — host the `server/` app on a platform with a persistent writable disk
   (Render, Railway, Fly.io, a VPS, etc.). It serves `/api/*`, `/images/*`, and `/pdfs/*`,
   and has permissive CORS so the Vercel frontend can call it. Note its public URL.
2. **Frontend** — import this repo into Vercel. `vercel.json` already sets the install/build
   commands and `client/dist` output, plus the SPA rewrite. In the Vercel project's
   **Environment Variables**, set:

   ```
   VITE_API_BASE_URL = https://your-backend-host.example.com
   ```

   This is read at build time ([client/src/lib/config.ts](client/src/lib/config.ts)) and
   makes the frontend call the remote backend for the API and assets. Leave it unset locally.

> The `127` build error happens when Vercel isn't told to install the client's dependencies;
> `vercel.json` fixes that by running `npm install --prefix client` and building `client/`.

### Backend on Railway (with persistent storage)

`railway.json` configures the build (`npm install --prefix server`) and start
(`npm --prefix server start`) commands. Keep the service's **Root Directory at the repo
root** so the server can reach `client/public/`.

By default the server stores data inside the repo folders, which on Railway are **wiped on
every redeploy**. To keep created checklists/images/PDFs, attach a volume and point storage
at it:

1. In the Railway service: **Settings → Volumes → New Volume**, mount path `/data`.
2. **Settings → Variables**, add `STORAGE_DIR = /data`.
3. Redeploy.

The server then reads/writes `/data/{data,images,pdfs}` and, on the **first** boot with an
empty volume, seeds it from the repo's bundled checklists and images. Later boots never
overwrite the volume, so your created content survives redeploys. (Storage paths can also be
overridden individually via `DATA_DIR` / `IMAGES_DIR` / `PDFS_DIR`.)

## Data

Each aircraft is a JSON file in `server/data/<id>.json`:

```jsonc
{
  "id": "cessna-172-skyhawk",
  "make": "Cessna",
  "model": "172 Skyhawk",
  "thumbnail": "/images/cessna-172-skyhawk/thumb.svg",
  "sections": [
    {
      "id": "preflight",
      "title": "Preflight",
      "image": "/images/cessna-172-skyhawk/preflight.svg",
      "items": [{ "id": "p1", "label": "Control lock", "detail": "REMOVE" }]
    }
  ]
}
```

Images are bundled in `client/public/images/<aircraft-id>/`. The seed images are
generated SVG placeholders — drop in real MSFS 2024 screenshots (same paths) to replace
them, or set new paths in the editor.

## API

| Method | Route                | Purpose                          |
| ------ | -------------------- | -------------------------------- |
| GET    | `/api/aircraft`      | List all aircraft (summary)      |
| GET    | `/api/aircraft/:id`  | Full checklist for one aircraft  |
| POST   | `/api/aircraft`      | Create (id derived from make+model) |
| PUT    | `/api/aircraft/:id`  | Replace an existing aircraft     |
| DELETE | `/api/aircraft/:id`  | Delete an aircraft               |

Aircraft ids are validated against a slug pattern to prevent path traversal.
