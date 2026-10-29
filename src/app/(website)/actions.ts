"use server";
import { headers } from "next/headers";
import { submitApplication } from "@/lib/applications";
import { createBooking, getFreeSlots, type BookingResult } from "@/lib/booking";

export type ApplyValues = { full_name: string; phone: string; email: string; message: string };
export type ApplyState = { ok: boolean; error?: string; fieldErrors?: Record<string, string>; values?: ApplyValues } | null;

export async function applyAction(_: ApplyState, fd: FormData): Promise<ApplyState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unbekannt";
  const result = await submitApplication(
    {
      full_name: fd.get("full_name"),
      phone: fd.get("phone"),
      email: fd.get("email"),
      message: fd.get("message") || undefined,
      consent: fd.get("consent") === "on",
      website: fd.get("website") || undefined,
      source: "website",
    },
    ip,
  );
  const str = (k: string) => String(fd.get(k) ?? "").slice(0, 2000);
  // Eingaben zurückgeben, damit sie nach einer Fehlermeldung erhalten bleiben
  const values = { full_name: str("full_name"), phone: str("phone"), email: str("email"), message: str("message") };
  return result.ok ? { ok: true, values } : { ok: false, error: result.error, fieldErrors: result.fieldErrors, values };
}

export type SlotList = { start: string; end: string }[];

/** Freie Termine für den Buchungskalender. */
export async function loadSlots(): Promise<SlotList> {
  return getFreeSlots();
}

export async function bookSlot(input: { start: string; full_name: string; email: string; phone: string; message?: string; consent: boolean; website?: string }): Promise<BookingResult> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unbekannt";
  return createBooking(input, ip);
}
