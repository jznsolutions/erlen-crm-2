// Texterkennung im Browser (Tesseract, kostenlos). Das Bild verlässt den Rechner nicht;
// Programm und Sprachdaten kommen vom eigenen Server (public/ocr).
import { wordsToTable, type OcrWord } from "@/lib/partner-ocr";

/** Bild für die Erkennung vorbereiten: vergrößern (kleine Schrift) und in Graustufen. */
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const img = await createImageBitmap(file);
  const scale = Math.max(1, Math.min(3, 2400 / img.width));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  const ctx = c.getContext("2d")!;
  ctx.filter = "grayscale(1) contrast(1.2)";
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export async function readTableFromImage(file: Blob, onProgress?: (p: number) => void): Promise<string[][]> {
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
    const { data } = await worker.recognize(await prepare(file), {}, { blocks: true });
    const words: OcrWord[] = [];
    for (const b of data.blocks ?? [])
      for (const p of b.paragraphs)
        for (const l of p.lines)
          for (const w of l.words) if (w.confidence > 20) words.push({ text: w.text, ...w.bbox });
    return wordsToTable(words);
  } finally {
    await worker.terminate();
  }
}
