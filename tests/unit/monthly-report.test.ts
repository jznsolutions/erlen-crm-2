import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

describe("Monatsbericht", () => {
  it("Monatsgrenzen und Vormonat", async () => {
    const { monthRange, previousMonth, monthName, change } = await import("@/lib/monthly-report");
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2028-02").to).toBe("2028-02-29");
    expect(previousMonth("2026-01-01")).toBe("2025-12");
    expect(previousMonth("2026-11-02")).toBe("2026-10");
    expect(monthName("2026-10-01")).toBe("Oktober 2026");
    expect(change(110, 100)).toBeCloseTo(0.1);
    expect(change(5, 0)).toBeNull();
  });

  it("PDF wird erzeugt (auch mit vielen Zeilen über mehrere Seiten)", async () => {
    const { renderMonthlyReportPdf } = await import("@/lib/monthly-report");
    const pdf = await renderMonthlyReportPdf(
      {
        from: "2026-10-01", to: "2026-10-31", prev_from: "2026-09-01", prev_to: "2026-09-30",
        totals: { confirmed: 124, cancelled: 28, pending: 8, prev_confirmed: 119, prev_cancelled: 4, revenue_cents: 655000, prev_revenue_cents: 647500, sellers: 6, prev_sellers: 6 },
        active_employees: 12, new_employees: 1,
        products: Array.from({ length: 30 }, (_, i) => ({ name: `Produkt ${i} – Ä`, unit: "Verträge", confirmed: i, cancelled: 1, prev_confirmed: 2 })),
        teams: [{ name: "Team Nord", confirmed: 47, cancelled: 27, sellers: 3 }],
        top: [{ name: "Leon Wagner", team: null, confirmed: 48 }],
        applicants: { new: 5, bookings: 3, hired: 1 },
      },
      "ERLEN Vertriebsagentur",
    );
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(3000);
  });
});
