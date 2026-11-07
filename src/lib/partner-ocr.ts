// Aus erkannten Wörtern eines Screenshots (Texterkennung im Browser) wieder eine Tabelle bauen.
// Reine Logik ohne Abhängigkeiten – testbar ohne Browser.
import { findHeader } from "@/lib/partner-sync";

export type OcrWord = { text: string; x0: number; y0: number; x1: number; y1: number };
type Cell = { text: string; x0: number; x1: number };

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** Wörter zu Zeilen (gleiche Höhe) und Zellen (große Lücke = neue Spalte) gruppieren. */
function toRows(words: OcrWord[]): Cell[][] {
  const ws = words.filter((w) => w.text.trim() && /[\p{L}\p{N}]/u.test(w.text));
  if (!ws.length) return [];
  const h = median(ws.map((w) => w.y1 - w.y0)) || 10;
  const sorted = [...ws].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const lines: { yc: number; words: OcrWord[] }[] = [];
  for (const w of sorted) {
    const yc = (w.y0 + w.y1) / 2;
    const line = lines[lines.length - 1];
    if (line && Math.abs(yc - line.yc) < h * 0.55) {
      line.words.push(w);
      line.yc = line.words.reduce((s, x) => s + (x.y0 + x.y1) / 2, 0) / line.words.length;
    } else lines.push({ yc, words: [w] });
  }
  return lines.map((l) => {
    const ordered = l.words.sort((a, b) => a.x0 - b.x0);
    const cells: Cell[] = [];
    for (const w of ordered) {
      const last = cells[cells.length - 1];
      if (last && w.x0 - last.x1 < h * 0.9) {
        last.text += ` ${w.text.trim()}`;
        last.x1 = Math.max(last.x1, w.x1);
      } else cells.push({ text: w.text.trim(), x0: w.x0, x1: w.x1 });
    }
    return cells;
  });
}

/** Erkannte Wörter → Tabelle (erste Zeile = Kopfzeile), Spalten an der Kopfzeile ausgerichtet. */
export function wordsToTable(words: OcrWord[]): string[][] {
  const rows = toRows(words);
  if (!rows.length) return [];
  let h = findHeader(rows.map((r) => r.map((c) => c.text)));
  if (h === 0 && rows.length > 1) {
    // Keine bekannte Kopfzeile: die Zeile mit den meisten Zellen gibt die Spalten vor
    const first = rows.slice(0, 10);
    h = first.reduce((best, r, i) => (r.length > first[best].length ? i : best), 0);
  }
  const anchors = rows[h];
  // Bereich jeder Spalte reicht bis zur Mitte der Lücke zur Nachbarspalte
  const ranges = anchors.map((a, i) => ({
    from: i === 0 ? -Infinity : (anchors[i - 1].x1 + a.x0) / 2,
    to: i === anchors.length - 1 ? Infinity : (a.x1 + anchors[i + 1].x0) / 2,
  }));
  const out: string[][] = [anchors.map((a) => a.text)];
  for (const r of rows.slice(h + 1)) {
    const line = anchors.map(() => "");
    for (const c of r) {
      let best = 0;
      let bestScore = -Infinity;
      ranges.forEach((g, i) => {
        const overlap = Math.min(c.x1, g.to) - Math.max(c.x0, g.from);
        const score = overlap > 0 ? overlap : -Math.abs((c.x0 + c.x1) / 2 - (anchors[i].x0 + anchors[i].x1) / 2) - 1e6;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      });
      line[best] = line[best] ? `${line[best]} ${c.text}` : c.text;
    }
    if (line.some(Boolean)) out.push(line);
  }
  return out;
}
