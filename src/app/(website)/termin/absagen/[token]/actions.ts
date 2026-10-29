"use server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bookingAvailable, getBookingSettings, sendBookingCancellation } from "@/lib/booking";
import { hashToken } from "@/lib/tokens";

export async function cancelBookingByToken(token: string): Promise<{ message: string }> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token) || !bookingAvailable()) return { message: "Dieser Link ist ungültig." };
  const { data, error } = await createAdminClient().rpc("booking_cancel_by_token", { p_token_hash: hashToken(token) });
  const b = data?.[0];
  if (error || !b) return { message: "Der Termin konnte nicht abgesagt werden (bereits abgesagt oder vorbei)." };
  const { data: full } = await createAdminClient().from("bookings").select("ends_at").eq("id", b.id).single();
  await sendBookingCancellation(
    { id: b.id, start: new Date(b.starts_at).toISOString(), end: new Date(full!.ends_at).toISOString(), full_name: b.full_name, email: b.email },
    await getBookingSettings(),
    true,
  ).catch((e) => console.error("[termine]", (e as Error).message));
  return { message: "Dein Termin wurde abgesagt. Du erhältst eine Bestätigung per E-Mail." };
}
