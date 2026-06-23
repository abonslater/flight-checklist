import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { buildChecklist, type ParsedChecklist, type PdfPage, type PdfToken } from "./pdfParse";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export type { ParsedChecklist };

/** Extract every page's text tokens from a PDF file, then parse them into a checklist. */
export async function importChecklistFromPdf(file: File): Promise<ParsedChecklist> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  const pages: PdfPage[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const tokens: PdfToken[] = [];
    for (const it of content.items) {
      // TextItem has str/transform/width; TextMarkedContent does not.
      if (!("str" in it) || !("transform" in it)) continue;
      if (!it.str || !it.str.trim()) continue;
      tokens.push({ x: it.transform[4], y: it.transform[5], w: it.width ?? 0, str: it.str });
    }
    pages.push({ width: viewport.width, height: viewport.height, tokens });
  }

  return buildChecklist(pages);
}
