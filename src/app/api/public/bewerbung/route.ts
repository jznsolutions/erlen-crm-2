import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { submitApplication } from "@/lib/applications";

// Öffentlicher Endpunkt für externe Bewerbungsformulare (die eigene Website nutzt die Server Action).
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

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unbekannt";
  const result = await submitApplication(body, ip);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status, headers });
  return NextResponse.json({ ok: true }, { status: 201, headers });
}
