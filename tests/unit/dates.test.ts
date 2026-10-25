import { describe, expect, it } from "vitest";
import {
  addDays, daysBetweenInclusive, endOfMonth, endOfWeek, isIsoDate, periodRange, startOfWeek, todayBerlin,
} from "@/lib/dates";

describe("Datumslogik (Europe/Berlin)", () => {
  it("todayBerlin berücksichtigt die Zeitzone um Mitternacht", () => {
    // 23:30 UTC am 31.12. ist in Berlin bereits der 1.1.
    expect(todayBerlin(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    // Sommerzeit: 22:30 UTC = 00:30 MESZ
    expect(todayBerlin(new Date("2026-07-14T22:30:00Z"))).toBe("2026-07-15");
    expect(todayBerlin(new Date("2026-07-14T21:30:00Z"))).toBe("2026-07-14");
  });
  it("Wochen beginnen am Montag", () => {
    expect(startOfWeek("2026-10-25")).toBe("2026-10-19"); // Sonntag
    expect(startOfWeek("2026-10-19")).toBe("2026-10-19");
    expect(endOfWeek("2026-10-21")).toBe("2026-10-25");
  });
  it("Monatsenden inkl. Schaltjahr", () => {
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
    expect(endOfMonth("2027-02-10")).toBe("2027-02-28");
    expect(endOfMonth("2026-12-05")).toBe("2026-12-31");
  });
  it("Zeiträume", () => {
    expect(periodRange("monat", "2026-10-25")).toEqual({ from: "2026-10-01", to: "2026-10-25" });
    expect(periodRange("vormonat", "2026-03-15")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange("quartal", "2026-11-03")).toEqual({ from: "2026-10-01", to: "2026-11-03" });
    expect(periodRange("30tage", "2026-10-25").from).toBe("2026-09-26");
  });
  it("Hilfsfunktionen", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(daysBetweenInclusive("2026-10-01", "2026-10-31")).toBe(31);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("28.02.2026")).toBe(false);
  });
});
