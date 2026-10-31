import Link from "next/link";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { DisableMfaButton, ResetMfaButton } from "./two-factor-buttons";

/** Zwei-Faktor-Anmeldung im Profil: selbst einrichten/abschalten oder (Verwaltung) zurücksetzen. */
export async function TwoFactorCard({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const supabase = await createClient();
  let enrolled = false;
  let required = false;
  if (isSelf) {
    const { data, error } = await supabase.rpc("mfa_status");
    if (error) return null; // Datenbank-Update noch nicht eingespielt
    enrolled = Boolean(data?.[0]?.has_factor);
    required = Boolean(data?.[0]?.required);
  } else {
    const { data, error } = await supabase.rpc("mfa_enrolled", { p_users: [userId] });
    if (error) return null;
    enrolled = Boolean(data?.[0]?.enrolled);
  }
  return (
    <Card id="zwei-faktor" className="scroll-mt-24">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            {enrolled ? <ShieldCheck className="size-4 text-success" /> : <ShieldAlert className="size-4 text-warning" />}
            Zwei-Faktor-Anmeldung
            <Badge variant={enrolled ? "success" : "warning"}>{enrolled ? "Aktiv" : "Nicht eingerichtet"}</Badge>
          </CardTitle>
          <CardDescription>
            {isSelf
              ? "Zusätzlich zum Passwort ein Code aus einer App auf deinem Handy – schützt dein Konto, falls dein Passwort in falsche Hände gerät."
              : "Hat die Person ihr Handy verloren, kannst du die Zwei-Faktor-Anmeldung hier zurücksetzen."}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        {isSelf && !enrolled ? <Link href="/zwei-faktor/einrichten?weiter=/profil" className={buttonVariants({})}>Jetzt einrichten</Link> : null}
        {isSelf && enrolled && !required ? <DisableMfaButton /> : null}
        {isSelf && enrolled && required ? <p className="text-sm text-muted-foreground">Für deine Rolle ist die Zwei-Faktor-Anmeldung Pflicht.</p> : null}
        {!isSelf && enrolled ? <ResetMfaButton userId={userId} /> : null}
        {!isSelf && !enrolled ? <p className="text-sm text-muted-foreground">Die Person hat noch keine Zwei-Faktor-Anmeldung eingerichtet.</p> : null}
      </CardContent>
    </Card>
  );
}
