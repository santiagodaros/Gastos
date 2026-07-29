/**
 * Extrae el texto de un PDF (en el navegador) reconstruyendo las líneas
 * por posición vertical. Usado por el importador de resúmenes.
 */
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface TextItem { str: string; transform: number[] }

export async function extractPdfLines(file: File): Promise<string[]> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const lines: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Agrupar items por coordenada Y (redondeada) para rearmar cada renglón.
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const raw of content.items as unknown as TextItem[]) {
      const s = raw.str;
      if (!s || !s.trim()) continue;
      const y = Math.round(raw.transform[5]);
      const x = raw.transform[4];
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x, s });
    }

    // En PDF, Y crece hacia arriba → ordeno renglones de arriba hacia abajo.
    const ys = [...rows.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const parts = rows.get(y)!.sort((a, b) => a.x - b.x);
      const line = parts.map((p) => p.s).join(" ").replace(/\s+/g, " ").trim();
      if (line) lines.push(line);
    }
  }

  return lines;
}
