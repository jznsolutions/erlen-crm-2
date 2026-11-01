import { describe, expect, it } from "vitest";
import { parseSpokenEntry } from "@/lib/voice-entry";

const products = [
  { id: "g", name: "Glasfaser" },
  { id: "pv", name: "PV-Leads" },
  { id: "s", name: "Strom" },
  { id: "gas", name: "Gas" },
];

describe("Schnelleingabe per Sprache", () => {
  it("versteht Menge, Produkt, Vorgangs-ID und Datum", () => {
    expect(parseSpokenEntry("Zwei Glasfaser, Vorgang 12345, gestern", products)).toEqual({ productId: "g", quantity: 2, ref: "12345", daysAgo: 1 });
    expect(parseSpokenEntry("3 PV Leads heute", products)).toEqual({ productId: "pv", quantity: 3, daysAgo: 0 });
    expect(parseSpokenEntry("einen Stromvertrag Vertragsnummer AB 778 12", products)).toEqual({ productId: "s", quantity: 1, ref: "AB77812" });
  });
  it("verwechselt Gas nicht mit Glasfaser und liest Notizen", () => {
    expect(parseSpokenEntry("ein Gas vorgestern Notiz: Kunde will Rückruf", products)).toEqual({ productId: "gas", quantity: 1, daysAgo: 2, note: "Kunde will Rückruf" });
    expect(parseSpokenEntry("Glasfaser", products).productId).toBe("g");
  });
  it("die Vorgangsnummer wird nicht als Menge gelesen", () => {
    expect(parseSpokenEntry("Glasfaser Vorgang 4711", products)).toEqual({ productId: "g", ref: "4711" });
  });
});
