import { describe, expect, it } from "vitest";
import { wordsToTable, type OcrWord } from "@/lib/partner-ocr";

// Wörter so, wie die Texterkennung sie liefert: Text + Rahmen (Pixel)
const line = (y: number, cells: [number, string][]): OcrWord[] =>
  cells.flatMap(([x, text]) => {
    let cx = x;
    return text.split(" ").map((t) => {
      const w = { text: t, x0: cx, y0: y + (t.length % 2), x1: cx + t.length * 9, y1: y + 18 };
      cx = w.x1 + 6; // Wortabstand innerhalb einer Zelle
      return w;
    });
  });

describe("Screenshot → Tabelle", () => {
  it("baut Zeilen und Spalten aus den erkannten Wörtern", () => {
    const words = [
      ...line(10, [[20, "Meine Aufträge"]]),
      ...line(60, [[20, "Auftragsnummer"], [180, "Kunde"], [330, "Verkäufer"], [450, "Tarif"], [580, "Status"], [720, "Erstellt am"]]),
      ...line(100, [[20, "DG-1001"], [180, "Max Muster"], [330, "VP-11"], [450, "Strom Basis"], [580, "Aktiviert"], [720, "03.11.2026"]]),
      // leere Kunden-Zelle, Status „In Bearbeitung“ aus zwei Wörtern
      ...line(140, [[20, "DG-1002"], [330, "Paul Peters"], [450, "Strom Basis"], [580, "In Bearbeitung"], [720, "04.11.2026"]]),
    ].reverse(); // Reihenfolge der Erkennung ist egal
    expect(wordsToTable(words)).toEqual([
      ["Auftragsnummer", "Kunde", "Verkäufer", "Tarif", "Status", "Erstellt am"],
      ["DG-1001", "Max Muster", "VP-11", "Strom Basis", "Aktiviert", "03.11.2026"],
      ["DG-1002", "", "Paul Peters", "Strom Basis", "In Bearbeitung", "04.11.2026"],
    ]);
  });

  it("leeres Bild ergibt keine Tabelle", () => {
    expect(wordsToTable([])).toEqual([]);
    expect(wordsToTable([{ text: "|", x0: 0, y0: 0, x1: 2, y1: 10 }])).toEqual([]);
  });
});
