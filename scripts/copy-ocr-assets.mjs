// Kopiert die kostenlose Texterkennung (Tesseract) nach public/ocr, damit sie
// vom eigenen Server geladen wird – keine fremden Server, keine Kosten.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const out = join(process.cwd(), "public", "ocr");
const tess = dirname(require.resolve("tesseract.js/package.json"));
const core = dirname(require.resolve("tesseract.js-core/package.json"));
const deu = dirname(require.resolve("@tesseract.js-data/deu/package.json"));

mkdirSync(join(out, "lang"), { recursive: true });
cpSync(join(tess, "dist", "worker.min.js"), join(out, "worker.min.js"));
for (const f of ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"]) {
  cpSync(join(core, f), join(out, f));
}
cpSync(join(deu, "4.0.0_best_int", "deu.traineddata.gz"), join(out, "lang", "deu.traineddata.gz"));
if (!existsSync(join(out, "worker.min.js"))) throw new Error("OCR-Dateien fehlen");
console.log("Texterkennung bereit (public/ocr)");
