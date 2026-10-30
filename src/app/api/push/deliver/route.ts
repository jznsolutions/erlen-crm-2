import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { cronSecret } from "@/lib/booking";
import { deliverPendingPush } from "@/lib/push";

export const dynamic = "force-dynamic";

// Wird von der Datenbank direkt nach einer neuen Benachrichtigung aufgerufen (pg_net).
export async function POST(request: NextRequest) {
  const secret = cronSecret();
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, sent: await deliverPendingPush() });
  } catch (e) {
    console.error("[push]", (e as Error).message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
