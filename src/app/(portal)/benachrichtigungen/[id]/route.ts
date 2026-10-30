import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Öffnet eine Benachrichtigung: als gelesen markieren und zum Ziel weiterleiten.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fallback = new URL("/benachrichtigungen", request.nextUrl.origin);
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.redirect(fallback);
  const supabase = await createClient();
  const { data: n } = await supabase.from("notifications").select("link").eq("id", id).maybeSingle();
  if (!n) return NextResponse.redirect(fallback);
  await supabase.rpc("notifications_mark_read", { p_ids: [id] });
  // Nur Pfade innerhalb des Portals (Datenbank erzwingt führenden „/“), keine fremden Adressen
  const target = n.link && /^\/(?![/\\])[^\s]*$/.test(n.link) ? n.link : "/benachrichtigungen";
  return NextResponse.redirect(new URL(target, request.nextUrl.origin), { headers: { "Cache-Control": "no-store" } });
}
