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
    expect(parseCountLines(CARD, people)).toEqual([
      { name: "Paul Peters", categories: [{ label: "15-39", qualified: 2, total: 2 }, { label: ">39", qualified: 2, total: 2 }] },
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
    expect(parseCountLines(lines, people)).toEqual([
      { name: "Max Neumann", categories: [{ label: "<15", qualified: 1, total: 3 }, { label: "15-39", qualified: 5, total: 6 }] },
      { name: "Anna Berg", categories: [{ label: ">39", qualified: 7, total: null }] },
    ]);
  });

  it("Karte ohne Namen (abgeschnitten) und Kategorie ohne lesbare Zahl", () => {
    expect(parseCountLines(["15-39 Module 50%", "", "x"], people)).toEqual([{ name: "", categories: [{ label: "15-39", qualified: null, total: null }] }]);
    expect(normCategory("≥ 40")).toBe(">=40");
  });
});
