import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { cronSecret, sendDueReminders } from "@/lib/booking";

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
    return NextResponse.json({ ok: true, reminders: sent });
  } catch (e) {
    console.error("[cron]", (e as Error).message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
