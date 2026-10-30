import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Abruf einer Unterlage: Zugriff prüft die Datenbank (RLS), danach 60 Sekunden gültiger Link.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const supabase = await createClient();
  const { data: d } = await supabase.from("employee_documents").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!d) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data } = await supabase.storage.from("employee-docs").createSignedUrl(d.storage_path, 60, download ? { download: d.file_name } : undefined);
  if (!data?.signedUrl) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
