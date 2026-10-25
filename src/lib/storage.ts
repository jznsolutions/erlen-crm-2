import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Erzeugt kurzlebige signierte URLs für private Dateien – im Kontext des
 * angemeldeten Benutzers, d. h. die Storage-RLS-Richtlinien gelten.
 */
export async function signedUrl(bucket: "avatars" | "documents" | "academy", path: string | null | undefined, seconds = 300, download?: string) {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, seconds, download ? { download } : undefined);
  return data?.signedUrl ?? null;
}

export async function signedUrls(bucket: "avatars" | "documents" | "academy", paths: string[], seconds = 300) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();
  const supabase = await createClient();
  const { data } = await supabase.storage.from(bucket).createSignedUrls(unique, seconds);
  return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [(d.path ?? null) as string, d.signedUrl as string]));
}
