import { describe, expect, it } from "vitest";
import { DAILY_QUOTES, quoteForDay } from "@/lib/daily-quote";

describe("Spruch des Tages", () => {
  it("wechselt täglich und nutzt alle Sprüche", () => {
    expect(quoteForDay("2026-11-11")).toBe(quoteForDay("2026-11-11"));
    expect(quoteForDay("2026-11-11")).not.toBe(quoteForDay("2026-11-12"));
    const seen = new Set<string>();
    for (let d = 0; d < DAILY_QUOTES.length; d++) {
      const day = new Date(Date.UTC(2027, 0, 1 + d)).toISOString().slice(0, 10);
      seen.add(quoteForDay(day).text);
    }
    expect(seen.size).toBe(DAILY_QUOTES.length);
  });
});
