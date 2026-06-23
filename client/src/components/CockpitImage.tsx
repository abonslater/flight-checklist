import { useState } from "react";
import { backendUrl } from "../lib/config";

/** Cockpit reference image with graceful fallback and tap-to-zoom. */
export default function CockpitImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const url = backendUrl(src);

  if (!src || failed) {
    return (
      <div className="flex aspect-[16/9] w-full items-center justify-center rounded-xl border border-dashed border-cockpit-edge bg-cockpit-panel text-slate-500">
        No cockpit image
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setZoomed(true)}
        className="block w-full overflow-hidden rounded-xl border border-cockpit-edge bg-cockpit-bg"
        aria-label="Zoom cockpit image"
      >
        <img
          src={url}
          alt={alt}
          onError={() => setFailed(true)}
          className="aspect-[16/9] w-full object-cover"
        />
      </button>

      {zoomed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setZoomed(false)}
          role="dialog"
          aria-modal="true"
        >
          <img src={url} alt={alt} className="max-h-full max-w-full object-contain" />
          <button
            type="button"
            className="touch-target absolute right-4 top-4 rounded-full bg-white/10 px-4 text-lg"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
