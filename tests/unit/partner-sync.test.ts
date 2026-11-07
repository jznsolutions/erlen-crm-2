import { describe, expect, it } from "vitest";
import { distinctValues, findHeader, guessColumns, guessSeller, guessTarget, parsePastedTable, planRows } from "@/lib/partner-sync";

// So sieht eine aus dem Browser kopierte Tabelle aus (Tabulator-getrennt), mit Kundendaten-Spalten
const PASTE = [
  "Meine Aufträge",
  "Auftragsnummer\tKunde\tAdresse\tVerkäufer\tTarif\tStatus\tErstellt am",
  "DG-1001\tMax Muster\tWeg 1, 57612 Ort\tVP-11\tGlasfaser 300\tAktiviert\t03.11.2026",
  "DG-1002\tErika Muster\tWeg 2, 57612 Ort\tVP-12\tGlasfaser 1000\tStorniert\t04.11.2026",
  "DG-1003\tHans Muster\tWeg 3, 57612 Ort\tPaul Peters\tGlasfaser 300\tIn Prüfung\t05.11.2026",
  "DG-1004\tLea Muster\tWeg 4, 57612 Ort\tUnbekannt\tGlasfaser 300\tLead\t05.11.2026",
].join("\n");

const people = [
  { id: "u11", first_name: "Anna", last_name: "Berg", partner_seller_id: "VP-11" },
  { id: "u12", first_name: "Tim", last_name: "Klein", partner_seller_id: "vp-12" },
  { id: "u13", first_name: "Paul", last_name: "Peters", partner_seller_id: null },
];

describe("Abgleich Partner-CRM", () => {
  it("liest die kopierte Tabelle und erkennt Kopfzeile und Spalten", () => {
    const t = parsePastedTable(PASTE);
    const h = findHeader(t);
    expect(h).toBe(1);
    expect(guessColumns(t[h])).toEqual({ ref: "Auftragsnummer", seller: "Verkäufer", product: "Tarif", status: "Status", date: "Erstellt am" });
    expect(distinctValues(t, h, "Status")).toEqual(["Aktiviert", "In Prüfung", "Lead", "Storniert"]);
  });

  it("schlägt Status und Verkäufer sinnvoll vor", () => {
    expect(guessTarget("Aktiviert")).toBe("bestaetigt");
    expect(guessTarget("Storniert")).toBe("storniert");
    expect(guessTarget("Widerrufen")).toBe("storniert");
    expect(guessTarget("In Prüfung")).toBe("eingereicht");
    expect(guessTarget("Lead")).toBe("ignorieren");
    expect(guessSeller("VP-12", people)).toBe("u12");
    expect(guessSeller("Paul Peters", people)).toBe("u13");
    expect(guessSeller("Unbekannt", people)).toBeNull();
  });

  it("plant die Zeilen – Kundendaten werden nicht übernommen", () => {
    const t = parsePastedTable(PASTE);
    const h = findHeader(t);
    const rows = planRows(t, h, {
      columns: guessColumns(t[h]),
      status: {},
      products: { "Glasfaser 300": "p300", "Glasfaser 1000": "p1000" },
      sellers: { "VP-11": "u11", "VP-12": "u12", "Paul Peters": "u13" },
    }, "2026-11-07");
    expect(rows.map((r) => [r.ref, r.user_id, r.product_id, r.occurred_on, r.target, r.error])).toEqual([
      ["DG-1001", "u11", "p300", "2026-11-03", "bestaetigt", null],
      ["DG-1002", "u12", "p1000", "2026-11-04", "storniert", null],
      ["DG-1003", "u13", "p300", "2026-11-05", "eingereicht", null],
      ["DG-1004", null, "p300", "2026-11-05", "ignorieren", null],
    ]);
    expect(JSON.stringify(rows)).not.toContain("Muster");
    expect(JSON.stringify(rows)).not.toContain("57612");
  });
});
