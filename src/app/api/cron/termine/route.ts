import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { cronSecret, sendDueReminders } from "@/lib/booking";
import { deliverPendingPush } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Wird alle paar Minuten vom Zeitplaner (Supabase pg_cron oder Vercel Cron) aufgerufen
// und verschickt die Erinnerungs-Mails 2 Stunden vor den Terminen.
async function handle(request: NextRequest) {
  const secret = cronSecret();
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 401 });
  }
  try {
    const sent = await sendDueReminders();
    // Wettbewerbe: Platzierungen prüfen und bei Änderungen benachrichtigen (vor der Push-Zustellung)
    const admin = createAdminClient();
    const competition = await admin.rpc("competition_watch").then((r) => (r.error ? 0 : (r.data ?? 0)));
    // Unterlagen, die bald ablaufen (30 Tage vorher und nach Ablauf)
    const documents = await admin.rpc("document_expiry_watch").then((r) => (r.error ? 0 : (r.data ?? 0)));
    // Nachzustellen, falls die Sofortzustellung einer Push-Benachrichtigung ausgefallen ist
    const pushed = await deliverPendingPush().catch((e) => {
      console.error("[cron] push", (e as Error).message);
      return 0;
    });
    return NextResponse.json({ ok: true, reminders: sent, competition, documents, pushed });
  } catch (e) {
    console.error("[cron]", (e as Error).message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
