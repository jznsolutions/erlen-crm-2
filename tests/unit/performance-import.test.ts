import { describe, expect, it } from "vitest";
import { checkRows, parseCsv, parseDate, parseQuantity, readRows, type Person, type Product } from "@/lib/performance-import";

const people: Person[] = [
  { id: "u1", first_name: "Anna", last_name: "Berg", email: "anna@erlen.local", employee_number: "VP-0001", status: "aktiv" },
  { id: "u2", first_name: "Tim", last_name: "Klein", email: "tim@erlen.local", employee_number: "VP-0002", status: "aktiv" },
  { id: "u3", first_name: "Tim", last_name: "Klein", email: "tim2@erlen.local", employee_number: "VP-0003", status: "aktiv" },
  { id: "u4", first_name: "Alt", last_name: "Weg", email: "alt@erlen.local", employee_number: "VP-0004", status: "deaktiviert" },
];
const products: Product[] = [
  { id: "p1", name: "Strom", requires_external_ref: false },
  { id: "p2", name: "Glasfaser", requires_external_ref: true },
];

describe("Leistungs-Import", () => {
  it("liest CSV mit Semikolon, Anführungszeichen und BOM", () => {
    expect(parseCsv('﻿Mitarbeiter;Produkt;Notiz\r\nanna@erlen.local;Strom;"mit ; Semikolon"\r\n\r\n')).toEqual([
      ["Mitarbeiter", "Produkt", "Notiz"],
      ["anna@erlen.local", "Strom", "mit ; Semikolon"],
    ]);
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("versteht deutsche, ISO- und Excel-Datumsangaben", () => {
    expect(parseDate("31.10.2026")).toBe("2026-10-31");
    expect(parseDate("1.2.26")).toBe("2026-02-01");
    expect(parseDate("2026-10-31")).toBe("2026-10-31");
    expect(parseDate(46326)).toBe("2026-10-31");
    expect(parseDate(new Date(Date.UTC(2026, 9, 31)))).toBe("2026-10-31");
    expect(parseDate("31.02.2026")).toBeNull();
    expect(parseDate("morgen")).toBeNull();
  });

  it("Menge: leer = 1, nur ganze Zahlen 1–1000", () => {
    expect(parseQuantity("")).toBe(1);
    expect(parseQuantity("3")).toBe(3);
    expect(parseQuantity(2)).toBe(2);
    expect(parseQuantity("1,5")).toBeNull();
    expect(parseQuantity("0")).toBeNull();
  });

  it("findet die Kopfzeile auch unter einer Titelzeile und prüft jede Zeile", () => {
    const table = [
      ["Abschlüsse Oktober"],
      ["Name", "Produkt", "Datum", "Anzahl", "Vertragsnummer"],
      ["VP-0001", "strom", "30.10.2026", "", ""],
      ["Berg, Anna", "Glasfaser", "30.10.2026", "1", "G-1"],
      ["Tim Klein", "Strom", "30.10.2026", "1", ""],
      ["alt@erlen.local", "Strom", "30.10.2026", "1", ""],
      ["anna@erlen.local", "Wasser", "30.10.2026", "1", ""],
      ["anna@erlen.local", "Glasfaser", "30.10.2026", "1", ""],
      ["anna@erlen.local", "Glasfaser", "30.10.2026", "1", "g-1"],
      ["anna@erlen.local", "Strom", "01.12.2026", "1", ""],
    ];
    const { rows, missing } = readRows(table);
    expect(missing).toEqual([]);
    const checked = checkRows(rows, people, products, "2026-10-31");
    expect(checked.map((c) => [c.line, c.userId, c.error === null ? "ok" : c.error.split(" ")[0]])).toEqual([
      [3, "u1", "ok"],
      [4, "u1", "ok"],
      [5, null, "Name"],
      [6, "u4", "Mitarbeiter"],
      [7, "u1", "Produkt"],
      [8, "u1", "Vorgangs-ID"],
      [9, "u1", "Vorgangs-ID"],
      [10, "u1", "Datum"],
    ]);
    expect(checked[0].quantity).toBe(1);
    expect(checked[6].error).toContain("doppelt");
  });

  it("meldet fehlende Pflichtspalten", () => {
    expect(readRows([["Mitarbeiter", "Produkt"], ["a", "b"]]).missing).toEqual(["date"]);
    expect(readRows([["x", "y"]]).missing).toEqual(["employee", "product"]);
  });
});
