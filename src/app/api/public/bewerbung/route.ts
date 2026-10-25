import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";
import { applicationSchema } from "@/lib/validation";

// Öffentlicher Endpunkt für das Bewerbungsformular der ERLEN-Website.
// Schutz: Origin-Allowlist (CORS), Honeypot, Ratenbegrenzung, Größenlimit, Einwilligungspflicht.
// Es werden keine Daten zurückgegeben – nur Erfolg/Misserfolg.

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  const list = serverEnv().APPLICATION_ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(origin) ? origin : null;
}

function cors(origin: string | null) {
  const h = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
  if (origin) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    h.set("Access-Control-Allow-Headers", "Content-Type");
    h.set("Access-Control-Max-Age", "600");
  }
  return h;
}

export async function OPTIONS(request: NextRequest) {
  const origin = allowedOrigin(request.headers.get("origin"));
  return new NextResponse(null, { status: origin ? 204 : 403, headers: cors(origin) });
}

export async function POST(request: NextRequest) {
  const originHeader = request.headers.get("origin");
  const origin = allowedOrigin(originHeader);
  const headers = cors(origin);
  // Browser-Anfragen von fremden Websites ablehnen
  if (originHeader && !origin) return NextResponse.json({ ok: false, error: "Herkunft nicht erlaubt" }, { status: 403, headers });

  const text = await request.text();
  if (text.length > 10_000) return NextResponse.json({ ok: false, error: "Anfrage zu groß" }, { status: 413, headers });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "Ungültige Daten" }, { status: 400, headers });
  }

  const parsed = applicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Daten" }, { status: 422, headers });
  }
  // Honeypot ausgefüllt -> stillschweigend „erfolgreich“ (Bots erhalten kein Signal)
  if (parsed.data.website) return NextResponse.json({ ok: true }, { status: 200, headers });

  const admin = createAdminClient();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unbekannt";
  const key = "apply:" + createHash("sha256").update(ip + serverEnv().RATE_LIMIT_SALT).digest("hex").slice(0, 32);
  const { data: allowed } = await admin.rpc("rate_limit_hit", { p_key: key, p_window_seconds: 3600, p_max: 5 });
  if (allowed === false) return NextResponse.json({ ok: false, error: "Zu viele Anfragen. Bitte später erneut versuchen." }, { status: 429, headers });

  const { error } = await admin.from("applicants").insert({
    full_name: parsed.data.full_name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    message: parsed.data.message ?? null,
    source: parsed.data.source || "website",
    consent_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[bewerbung]", error.code);
    return NextResponse.json({ ok: false, error: "Bewerbung konnte nicht gespeichert werden." }, { status: 500, headers });
  }
  return NextResponse.json({ ok: true }, { status: 201, headers });
}
