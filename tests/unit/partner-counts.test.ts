import { describe, expect, it } from "vitest";
import { normCategory, parseCountLines } from "@/lib/partner-counts";

const people = [
  { id: "u1", first_name: "Paul", last_name: "Peters", partner_seller_id: null },
  { id: "u2", first_name: "Anna", last_name: "Berg", partner_seller_id: null },
];

// So liefert die Texterkennung eine Verkäufer-Karte der Partner-Übersicht (echte Ausgabe, Name ersetzt)
const CARD = [
  "23:34 X",
  "EnpalD2pD",
  "CL Paul Peters © Team Erlen",
  "Q4 ©4 O0 ®0 Mm100%",
  "© Gesamt © Qualifiziert",
  "4",
  "© In Bearbeitung @ Storniert",
  "(0)",
  "mM Erfolgsquote",
  "100%",
  "@ Qualifiziert @ In Bearbeitung @ Storniert",
  "© Disqualifizierung",
  "Keine Disqualifizierungen",
  "2 Anzahl Module",
  "15-39 Module . 50%",
  "2/2",
  ">39 Module . 50%",
  "2/2",
];

describe("Partner-Übersicht (Screenshot je Verkäufer)", () => {
  it("liest Verkäufer und qualifizierte Leads je Modul-Kategorie", () => {
    expect(parseCountLines(CARD, people)).toMatchObject([
      { name: "Paul Peters", qualifiedTotal: 4, totalSure: true, categories: [{ label: "15-39", qualified: 2, total: 2 }, { label: ">39", qualified: 2, total: 2 }] },
    ]);
  });

  it("mehrere Karten, unbekannter Name, Schreibvarianten", () => {
    const lines = [
      "Max Neumann Team Erlen",
      "< 15 Module 25%",
      "1 / 3",
      "15 – 39 Module",
      "5 | 6",
      "Anna Berg",
      ">39 Module 100%",
      "7",
    ];
    expect(parseCountLines(lines, people)).toMatchObject([
      { name: "Max Neumann", categories: [{ label: "<15", qualified: 1, total: 3 }, { label: "15-39", qualified: 5, total: 6 }] },
      { name: "Anna Berg", categories: [{ label: ">39", qualified: 7, total: null }] },
    ]);
  });

  it("Name und „Team …“ in getrennten Zeilen", () => {
    expect(parseCountLines(["Partner D2D", "Lena Schulz", "Team Erlen", "3:3:0:0:100%", "15-39 Module", "2 / 2"], people)).toMatchObject([
      { name: "Lena Schulz", categories: [{ label: "15-39", qualified: 2, total: 2 }] },
    ]);
  });

  it("Karte ohne Namen (abgeschnitten) und Kategorie ohne lesbare Zahl", () => {
    expect(parseCountLines(["15-39 Module 50%", "", "x"], people)).toEqual([{ name: "", categories: [{ label: "15-39", qualified: null, total: null }] }]);
    expect(normCategory("≥ 40")).toBe(">=40");
  });
});

import { matchVariant, moduleRange, splitTarget } from "@/lib/partner-counts";

describe("Modul-Kategorie → Provisionsstufe", () => {
  const options = [
    { value: "p:v1", label: "PV-Lead – bis 14 Module", productId: "p", variantId: "v1", name: "bis 14 Module" },
    { value: "p:v2", label: "PV-Lead – 15-39 Module", productId: "p", variantId: "v2", name: "15 - 39 Module" },
    { value: "p:v3", label: "PV-Lead – ab 40 Module", productId: "p", variantId: "v3", name: "ab 40 Modulen" },
    { value: "g:", label: "Glasfaser", productId: "g", variantId: null, name: "Glasfaser" },
  ];
  it("versteht übliche Schreibweisen", () => {
    expect(moduleRange("<15")).toEqual([0, 14]);
    expect(moduleRange("bis zu 14 Modulen")).toEqual([0, 14]);
    expect(moduleRange("15-39")).toEqual([15, 39]);
    expect(moduleRange(">39")).toEqual([40, Infinity]);
    expect(moduleRange("ab 40 Module")).toEqual([40, Infinity]);
    expect(moduleRange("Glasfaser")).toBeNull();
  });
  it("ordnet die Kategorien aus dem Screenshot automatisch zu", () => {
    expect(matchVariant("<15", options)).toBe("p:v1");
    expect(matchVariant("1-14", options)).toBe("p:v1");
    expect(matchVariant("15-39", options)).toBe("p:v2");
    expect(matchVariant(">39", options)).toBe("p:v3");
    expect(matchVariant("abc", options)).toBeNull();
    expect(splitTarget("p:v2")).toEqual({ product_id: "p", variant_id: "v2" });
    expect(splitTarget("g")).toEqual({ product_id: "g", variant_id: null });
  });
});

import { heatPumpCount, HEAT_PUMP, parseStatsLine } from "@/lib/partner-counts";

describe("Wärmepumpe = qualifiziert (grüner Haken) − PV-Kategorien", () => {
  it("liest die Kennzahlenzeile trotz mitgelesener Symbole", () => {
    // echte Ausgabe der Texterkennung: Personen-Symbol als „2“ mitgelesen
    expect(parseStatsLine("24 ©4 O0 ®0 100%")).toEqual({ qualified: 4, sure: true });
    expect(parseStatsLine("Q4 ©4 O0 ®0 Mm100%")).toEqual({ qualified: 4, sure: true });
    expect(parseStatsLine("29 ©7 O1 ®1 78%")).toEqual({ qualified: 7, sure: true });
    expect(parseStatsLine("12 ©12 O0 ®0 100%")).toEqual({ qualified: 12, sure: true });
    expect(parseStatsLine("© 5 3 1 1 60%")).toEqual({ qualified: 3, sure: true });
    expect(parseStatsLine("Gesamt Qualifiziert")).toBeNull();
  });

  it("Karte: 7 qualifiziert, PV 4 + 2 → 1 Wärmepumpe", () => {
    const lines = ["Paul Peters © Team Erlen", "29 ©7 O1 ®1 78%", "Anzahl Module", "15-39 Module · 50%", "4/5", ">39 Module · 50%", "2/3"];
    const [card] = parseCountLines(lines, people);
    expect(card).toMatchObject({ name: "Paul Peters", qualifiedTotal: 7, totalSure: true });
    expect(heatPumpCount(card.qualifiedTotal, card.categories.map((c) => c.qualified))).toBe(1);
  });

  it("nur Wärmepumpe (aufgeklappt, keine PV-Kategorien) – zugeklappte Karte zählt nicht", () => {
    expect(parseCountLines(["Anna Berg Team Erlen", "3 ©2 O1 ®0 67%", "Erfolgsquote", "Anzahl Module"], people)).toEqual([
      { name: "Anna Berg", categories: [], qualifiedTotal: 2, totalSure: true, expanded: true },
    ]);
    expect(parseCountLines(["Anna Berg Team Erlen", "3 ©2 O1 ®0 67%"], people)).toEqual([]);
    expect(heatPumpCount(2, [])).toBe(2);
    expect(heatPumpCount(null, [1])).toBeNull();
    expect(matchVariant(HEAT_PUMP, [{ value: "w:", label: "Wärmepumpe", productId: "w", variantId: null, name: "Wärmepumpe" }])).toBe("w:");
  });
});

import { mergeLines } from "@/lib/partner-ocr";

describe("Texterkennung: Zeilen zusammenführen", () => {
  it("führt getrennte Blöcke auf gleicher Höhe zusammen und liest die Kopfzeile", () => {
    const w = (text: string, x0: number, y0: number) => ({ text, x0, x1: x0 + 20, y0, y1: y0 + 14 });
    const merged = mergeLines([
      { words: [w("O0", 160, 183), w("XO", 200, 184), w("2100%", 240, 183)] },
      { words: [w("Jonas", 60, 145), w("Becker", 110, 145)] },
      { words: [w("5", 60, 183), w("5", 110, 182)] },
    ]);
    expect(merged).toEqual(["Jonas Becker", "5 5 O0 XO 2100%"]);
    expect(parseStatsLine(merged[1])).toEqual({ qualified: 5, sure: true });
  });
});
