import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mfaPending } from "@/lib/mfa";
import { safeRedirectPath } from "@/lib/redirect";
import { MfaEnroll } from "@/components/mfa/enroll";
import { SignOutLink } from "@/components/mfa/sign-out-link";

export const metadata: Metadata = { title: "Zwei-Faktor-Anmeldung einrichten" };

export default async function TwoFactorEnrollPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const weiter = params.weiter ? safeRedirectPath(params.weiter) : "";
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  const pending = await mfaPending(supabase);
  // Schon eingerichtet, aber Code noch nicht eingegeben
  if (pending === "/zwei-faktor") redirect(`/zwei-faktor?weiter=${encodeURIComponent(weiter || "/dashboard")}`);
  const { data: status } = await supabase.rpc("mfa_status");
  const s = status?.[0];
  if (s?.has_factor) redirect(weiter || "/profil");
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Zwei-Faktor-Anmeldung einrichten</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        {s?.required ? "Für deine Rolle ist das Pflicht. " : ""}Zusätzlich zum Passwort fragt das Portal bei der Anmeldung nach einem Code aus einer App auf deinem Handy. So kommt niemand mit einem gestohlenen Passwort an eure Daten.
      </p>
      <MfaEnroll weiter={weiter} />
      {s?.required ? <SignOutLink /> : null}
    </div>
  );
}
