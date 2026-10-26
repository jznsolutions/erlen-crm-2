import { describe, expect, it } from "vitest";
import { formatCents, parseEuroToCents } from "@/lib/format";

describe("Euro-Beträge", () => {
  it("liest deutsche und internationale Schreibweisen", () => {
    expect(parseEuroToCents("25")).toBe(2500);
    expect(parseEuroToCents("25,5")).toBe(2550);
    expect(parseEuroToCents("1.234,56 €")).toBe(123456);
    expect(parseEuroToCents("1.500")).toBe(150000);
    expect(parseEuroToCents("12.50")).toBe(1250);
    expect(parseEuroToCents("-10,00")).toBe(-1000);
  });
  it("lehnt ungültige Eingaben ab", () => {
    expect(parseEuroToCents("")).toBeNull();
    expect(parseEuroToCents("abc")).toBeNull();
    expect(parseEuroToCents("1,234")).toBeNull();
  });
  it("formatiert Cent als Euro", () => {
    expect(formatCents(123456).replace(/\s/g, " ")).toBe("1.234,56 €");
  });
});
