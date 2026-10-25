import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Serverseitig autorisierter Dateiabruf: Zugriff wird über RLS geprüft, danach
// wird auf eine nur 60 Sekunden gültige signierte URL weitergeleitet.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 60, download ? { download: doc.file_name } : undefined);
  if (!data?.signedUrl) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
