// Texterkennung im Browser (Tesseract, kostenlos). Das Bild verlässt den Rechner nicht;
// Programm und Sprachdaten kommen vom eigenen Server (public/ocr).
import type { Worker } from "tesseract.js";
import { wordsToTable, type OcrWord } from "@/lib/partner-ocr";
import { parseCountLines, type CountCard } from "@/lib/partner-counts";
import type { Person } from "@/lib/partner-sync";

/** Bild für die Erkennung vorbereiten: Graustufen, kleine Bilder vergrößern (Handy-Screenshots sind schon groß genug). */
async function prepare(file: Blob, zoom?: number): Promise<HTMLCanvasElement> {
  const img = await createImageBitmap(file);
  const scale = zoom ?? (img.width < 1000 ? Math.min(2.5, 1600 / img.width) : 1);
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  const ctx = c.getContext("2d")!;
  ctx.filter = "grayscale(1)";
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

type Progress = (p: number) => void;

async function withWorker<T>(onProgress: Progress | undefined, fn: (w: Worker) => Promise<T>): Promise<T> {
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  const base = `${window.location.origin}/ocr`;
  const worker = await createWorker("deu", OEM.LSTM_ONLY, {
    workerPath: `${base}/worker.min.js`,
    corePath: base,
    langPath: `${base}/lang`,
    workerBlobURL: false,
    logger: (m) => {
      if (m.status === "recognizing text") onProgress?.(m.progress);
    },
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    return await fn(worker);
  } finally {
    await worker.terminate();
  }
}

async function recognize(worker: Worker, file: Blob, zoom?: number) {
  const { data } = await worker.recognize(await prepare(file, zoom), {}, { blocks: true });
  const lines: { y: number; x: number; words: OcrWord[] }[] = [];
  for (const b of data.blocks ?? [])
    for (const p of b.paragraphs)
      for (const l of p.lines) {
        const words = l.words.filter((w) => w.confidence > 20).map((w) => ({ text: w.text, ...w.bbox }));
        if (words.length) lines.push({ y: l.bbox.y0, x: l.bbox.x0, words });
      }
  return lines.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Screenshot einer Tabelle → Zeilen und Spalten */
export async function readTableFromImage(file: Blob, onProgress?: Progress): Promise<string[][]> {
  return withWorker(onProgress, async (w) => wordsToTable((await recognize(w, file)).flatMap((l) => l.words)));
}

const toText = (lines: Awaited<ReturnType<typeof recognize>>) => lines.map((l) => l.words.map((x) => x.text).join(" "));

/**
 * Mehrere Screenshots der Partner-Übersicht → Verkäufer-Karten.
 * Fehlt bei einer Kategorie die Angabe „x / y“ (z. B. „2/2“ als „22“ gelesen),
 * wird das Bild ein zweites Mal in anderer Größe gelesen und das bessere Ergebnis genommen.
 */
export async function readCountCards(files: Blob[], people: Person[], onProgress?: (image: number, p: number) => void): Promise<CountCard[]> {
  let current = 0;
  const unsure = (cards: CountCard[]) => cards.flatMap((c) => c.categories).filter((k) => k.total === null).length;
  return withWorker(
    (p) => onProgress?.(current, p),
    async (w) => {
      const out: CountCard[] = [];
      for (const [i, f] of files.entries()) {
        current = i;
        onProgress?.(i, 0);
        let cards = parseCountLines(toText(await recognize(w, f)), people);
        for (const zoom of [1.5, 0.75]) {
          if (!cards.length || !unsure(cards)) break;
          const other = parseCountLines(toText(await recognize(w, f, zoom)), people);
          if (other.length && unsure(other) < unsure(cards)) cards = other;
        }
        out.push(...cards);
      }
      return out;
    },
  );
}
