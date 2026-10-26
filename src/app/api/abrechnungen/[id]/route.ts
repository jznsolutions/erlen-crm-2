import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Abruf einer Abrechnung/Gutschrift: Zugriff prüft die Datenbank (RLS), danach
// Weiterleitung auf eine 60 Sekunden gültige signierte URL.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const supabase = await createClient();
  const { data: s } = await supabase.from("statements").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!s?.storage_path) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data } = await supabase.storage
    .from("statements")
    .createSignedUrl(s.storage_path, 60, download ? { download: s.file_name ?? "Dokument.pdf" } : undefined);
  if (!data?.signedUrl) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
