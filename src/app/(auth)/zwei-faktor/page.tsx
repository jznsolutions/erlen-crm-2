import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mfaPending } from "@/lib/mfa";
import { safeRedirectPath } from "@/lib/redirect";
import { MfaCodeForm } from "@/components/mfa/code-form";
import { SignOutLink } from "@/components/mfa/sign-out-link";

export const metadata: Metadata = { title: "Bestätigungscode" };

export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const weiter = safeRedirectPath(params.weiter);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  const pending = await mfaPending(supabase);
  if (pending === "/zwei-faktor/einrichten") redirect(`/zwei-faktor/einrichten?weiter=${encodeURIComponent(weiter)}`);
  if (!pending) redirect(weiter);
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Bestätigungscode eingeben</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">Öffne deine Authenticator-App (z. B. Microsoft oder Google Authenticator) und gib den 6-stelligen Code für „ERLEN Portal“ ein.</p>
      <MfaCodeForm weiter={weiter} />
      <p className="mt-6 text-center text-xs text-muted-foreground">Handy verloren oder neue App? Die Administration kann deine Zwei-Faktor-Anmeldung zurücksetzen.</p>
      <SignOutLink />
    </div>
  );
}
