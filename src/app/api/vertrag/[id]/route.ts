import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Vertragsvorlage ansehen: nur die Person, der der Vertrag zugewiesen ist, oder die Verwaltung (Prüfung über RLS)
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.from("contract_requests").select("contract_templates(storage_path, file_name)").eq("id", id).maybeSingle();
  const t = data?.contract_templates;
  if (!t) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const { data: url } = await createAdminClient().storage.from("contracts").createSignedUrl(t.storage_path, 120);
  if (!url?.signedUrl) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.redirect(url.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
