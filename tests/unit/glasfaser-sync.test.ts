import { describe, expect, it } from "vitest";
import { detectColumns, groupContracts, parseGfTable } from "@/lib/glasfaser-sync";

// Echte Ausgabe der Texterkennung für einen Screenshot der Auftragsliste
const OCR = [
  ["Datum", "y", "Partner", "Produktname", "Type", "Anschlussadresse", "SV-/BKZ-Status", "GI"],
  ["23.11.2026", "", "PP-ES-LJanzen", "E.ON Highspeed 1000", "Servicevertrag", "Zeil 32,57080 Siegen", "", ""],
  ["23.11.2026", "", "PP-ES-LJanzen", "E.ON Highspeed 1000", "Servicevertrag", "Rittergasse 3,57080 Siegen", "VY Exported", ""],
];

describe("Glasfaser-Abgleich (Auftragsliste)", () => {
  it("erkennt die Spalten und zählt Verträge je Tag und Produkt", () => {
    expect(detectColumns(OCR[0])).toEqual({ date: 0, partner: 2, product: 3, status: 6, address: 5 });
    expect(groupContracts(parseGfTable(OCR))).toEqual([{ partner: "PP-ES-LJanzen", product: "E.ON Highspeed 1000", date: "2026-11-23", count: 2 }]);
  });

  it("überlappende Screenshots zählen nicht doppelt, Stornos zählen nicht", () => {
    const rows = [
      ...parseGfTable(OCR),
      ...parseGfTable([OCR[0], OCR[2], ["22.11.2026", "", "PP-ES-LJanzen", "E.ON Highspeed 500", "Servicevertrag", "Weg 1, 57080 Siegen", "Storniert", ""]]),
    ];
    expect(groupContracts(rows)).toEqual([{ partner: "PP-ES-LJanzen", product: "E.ON Highspeed 1000", date: "2026-11-23", count: 2 }]);
  });

  it("keine Kopfzeile → nichts", () => {
    expect(parseGfTable([["foo", "bar"], ["1", "2"]])).toEqual([]);
  });
});
