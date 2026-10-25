import { describe, expect, it } from "vitest";
import { achievement, confirmedBy, dailySeries, expectedShare, rank, summarize, type DailyRow } from "@/lib/metrics";

const row = (day: string, status: DailyRow["status"], quantity: number, user = "u1", product = "p1"): DailyRow => ({
  day, status, quantity, user_id: user, product_id: product, team_id: "t1", records: 1,
});

describe("Kennzahlen", () => {
  const rows: DailyRow[] = [
    row("2026-10-01", "bestaetigt", 3),
    row("2026-10-01", "eingereicht", 2),
    row("2026-10-02", "bestaetigt", 1),
    row("2026-10-03", "storniert", 1),
    row("2026-10-03", "korrigiert", 5),
    row("2026-10-04", "entwurf", 9),
    row("2026-10-04", "abgelehnt", 4),
  ];

  it("zählt nur bestätigte Leistungen als Leistung; offene separat", () => {
    const s = summarize(rows);
    expect(s.confirmed).toBe(4);
    expect(s.pending).toBe(2);
    expect(s.cancelled).toBe(1);
  });
  it("Durchschnitt pro aktivem Tag (Tage mit bestätigter Leistung)", () => {
    const s = summarize(rows);
    expect(s.activeDays).toBe(2);
    expect(s.avgPerActiveDay).toBe(2);
  });
  it("Stornoquote = storniert / (bestätigt + storniert)", () => {
    expect(summarize(rows).cancellationRate).toBeCloseTo(0.2);
    expect(summarize([]).cancellationRate).toBeNull();
  });
  it("Korrigierte Ursprungsdatensätze werden nicht doppelt gezählt", () => {
    // Korrektur: Ursprung (5, korrigiert) + Ersatz (3, bestätigt) => 3
    const s = summarize([row("2026-10-05", "korrigiert", 5), row("2026-10-05", "bestaetigt", 3)]);
    expect(s.confirmed).toBe(3);
  });
  it("Tagesreihe ist lückenlos", () => {
    const series = dailySeries(rows, "2026-09-30", "2026-10-02");
    expect(series).toEqual([
      { day: "2026-09-30", value: 0, pending: 0 },
      { day: "2026-10-01", value: 3, pending: 2 },
      { day: "2026-10-02", value: 1, pending: 0 },
    ]);
  });
  it("Rangfolge mit Gleichstand (1, 2, 2, 4)", () => {
    const m = confirmedBy(
      [row("d", "bestaetigt", 5, "a"), row("d", "bestaetigt", 3, "b"), row("d", "bestaetigt", 3, "c"), row("d", "bestaetigt", 1, "e"), row("d", "storniert", 50, "e")],
      "user_id",
    );
    expect(rank(m).map((r) => [r.id, r.rank])).toEqual([["a", 1], ["b", 2], ["c", 2], ["e", 4]]);
  });
  it("Zielerreichung", () => {
    expect(achievement(15, 20)).toBe(0.75);
    expect(achievement(5, 0)).toBeNull();
    expect(expectedShare("2026-10-01", "2026-10-31", "2026-10-16")).toBeCloseTo(16 / 31);
    expect(expectedShare("2026-10-01", "2026-10-31", "2026-11-02")).toBe(1);
  });
});
