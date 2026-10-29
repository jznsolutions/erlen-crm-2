import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { bookingAvailable, formatSlot } from "@/lib/booking";
import { hashToken } from "@/lib/tokens";
import { CancelBookingButton } from "./cancel-button";

export const metadata: Metadata = { title: "Termin absagen", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CancelBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = /^[A-Za-z0-9_-]{32,128}$/.test(token) && bookingAvailable();
  const { data } = valid ? await createAdminClient().rpc("booking_lookup_by_token", { p_token_hash: hashToken(token) }) : { data: null };
  const b = data?.[0];
  const past = b ? new Date(b.starts_at) < new Date() : false;
  return (
    <div className="mx-auto max-w-xl px-5 pb-24 pt-36 text-center sm:px-8">
      <h1 className="font-display text-3xl font-black uppercase text-white sm:text-4xl">Termin absagen</h1>
      {!b ? (
        <p className="mt-6 text-white/60">Dieser Link ist ungültig.</p>
      ) : b.status === "storniert" ? (
        <p className="mt-6 text-white/60">Der Termin am {formatSlot(new Date(b.starts_at).toISOString())} ist bereits abgesagt.</p>
      ) : past ? (
        <p className="mt-6 text-white/60">Dieser Termin liegt in der Vergangenheit.</p>
      ) : (
        <div className="glass mt-8 rounded-[2rem] p-8">
          <p className="text-white/70">Hallo {b.full_name.split(" ")[0]}, möchtest du deinen Termin wirklich absagen?</p>
          <p className="mt-3 text-lg font-semibold text-white">{formatSlot(new Date(b.starts_at).toISOString())}</p>
          <CancelBookingButton token={token} />
        </div>
      )}
      <Link href="/#bewerben" className="mt-8 inline-block text-sm text-white/60 underline underline-offset-4 hover:text-white">Neuen Termin wählen</Link>
    </div>
  );
}
