import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/redirect";
import { toCsv } from "@/lib/csv";
import { applicationSchema, passwordSchema, performanceCreateSchema } from "@/lib/validation";

describe("Sicherheitsfunktionen", () => {
  it("verhindert Open Redirects", () => {
    expect(safeRedirectPath("/leistungen?status=bestaetigt")).toBe("/leistungen?status=bestaetigt");
    for (const bad of ["//evil.de", "/\\evil.de", "https://evil.de", "javascript:alert(1)", "", null, 42]) {
      expect(safeRedirectPath(bad)).toBe("/dashboard");
    }
  });
  it("CSV-Export neutralisiert Formeln und maskiert Trennzeichen", () => {
    const csv = toCsv(["a", "b"], [["=HYPERLINK(\"x\")", "Text; mit \"Zitat\""]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(`"Text; mit ""Zitat"""`);
  });
  it("Passwortregeln", () => {
    expect(passwordSchema.safeParse("kurz1").success).toBe(false);
    expect(passwordSchema.safeParse("nurbuchstabenhier").success).toBe(false);
    expect(passwordSchema.safeParse("Sicher-Passwort-42").success).toBe(true);
  });
  it("Bewerbung erfordert Einwilligung und erkennt Honeypot", () => {
    const base = { full_name: "Max Muster", email: "max@example.com", phone: "0170 1234567" };
    expect(applicationSchema.safeParse(base).success).toBe(false);
    expect(applicationSchema.safeParse({ ...base, consent: true }).success).toBe(true);
    expect(applicationSchema.safeParse({ ...base, consent: true, website: "spam" }).data?.website).toBe("spam"); // Route verwirft solche Anfragen still
  });
  it("Leistungserfassung validiert Menge und Datum", () => {
    const base = { user_id: "8f6d1c2a-1111-4c3b-9a1e-123456789abc", product_id: "8f6d1c2a-2222-4c3b-9a1e-123456789abc", occurred_on: "2026-10-01", quantity: "2" };
    expect(performanceCreateSchema.safeParse(base).success).toBe(true);
    expect(performanceCreateSchema.safeParse({ ...base, quantity: "0" }).success).toBe(false);
    expect(performanceCreateSchema.safeParse({ ...base, quantity: "2.5" }).success).toBe(false);
    expect(performanceCreateSchema.safeParse({ ...base, occurred_on: "2026-02-31" }).success).toBe(false);
  });
});
