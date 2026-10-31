import Link from "next/link";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Plus, Smartphone } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";
import { DisableMfaButton, RemoveDeviceButton, ResetMfaButton } from "./two-factor-buttons";

type Device = { id: string; name: string; created: string };

/** Zwei-Faktor-Anmeldung im Profil: selbst einrichten/abschalten oder (Verwaltung) zurücksetzen. */
export async function TwoFactorCard({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const supabase = await createClient();
  let enrolled = false;
  let required = false;
  let devices: Device[] = [];
  if (isSelf) {
    const { data, error } = await supabase.rpc("mfa_status");
    if (error) return null; // Datenbank-Update noch nicht eingespielt
    enrolled = Boolean(data?.[0]?.has_factor);
    required = Boolean(data?.[0]?.required);
    if (enrolled) {
      const { data: f } = await supabase.auth.mfa.listFactors();
      devices = (f?.totp ?? []).filter((x) => x.status === "verified").map((x) => ({ id: x.id, name: x.friendly_name || "Gerät", created: x.created_at }));
    }
  } else {
    const { data, error } = await supabase.rpc("mfa_enrolled", { p_users: [userId] });
    if (error) return null;
    enrolled = Boolean(data?.[0]?.enrolled);
    if (enrolled) {
      // Nur Namen und Datum der Geräte (Aufrufer hat roles.assign, siehe Profilseite)
      const { data: f } = await createAdminClient().auth.admin.mfa.listFactors({ userId });
      devices = (f?.factors ?? []).filter((x) => x.status === "verified").map((x) => ({ id: x.id, name: x.friendly_name || "Gerät", created: x.created_at }));
    }
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
              ? "Zusätzlich zum Passwort ein Code aus einer App auf dem Handy – schützt dein Konto, falls dein Passwort in falsche Hände gerät. Mehrere Handys möglich (z. B. bei einem gemeinsamen Konto): Der Code von jedem eingetragenen Gerät funktioniert."
              : "Hat die Person ihr Handy verloren, kannst du die Zwei-Faktor-Anmeldung hier zurücksetzen (entfernt alle Geräte)."}
          </CardDescription>
        </div>
      </CardHeader>
      {devices.length ? (
        <CardContent className="pb-3">
          <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]" data-testid="mfa-devices">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] ring-1 ring-white/10"><Smartphone className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{d.name}</span>
                  <span className="block text-xs text-muted-foreground">eingerichtet am {formatDate(d.created)}</span>
                </span>
                {isSelf && (devices.length > 1 || !required) ? <RemoveDeviceButton factorId={d.id} name={d.name} last={devices.length === 1} /> : null}
              </li>
            ))}
          </ul>
        </CardContent>
      ) : null}
      <CardContent className="flex flex-wrap items-center gap-3">
        {isSelf && enrolled ? (
          <Link href="/zwei-faktor/einrichten?neu=1&weiter=/profil" className={buttonVariants({ variant: "secondary" })}><Plus />Weiteres Gerät hinzufügen</Link>
        ) : null}
        {isSelf && !enrolled ? <Link href="/zwei-faktor/einrichten?weiter=/profil" className={buttonVariants({})}>Jetzt einrichten</Link> : null}
        {isSelf && enrolled && !required && devices.length > 1 ? <DisableMfaButton /> : null}
        {isSelf && enrolled && required ? <p className="text-sm text-muted-foreground">Für deine Rolle ist die Zwei-Faktor-Anmeldung Pflicht.</p> : null}
        {!isSelf && enrolled ? <ResetMfaButton userId={userId} /> : null}
        {!isSelf && !enrolled ? <p className="text-sm text-muted-foreground">Die Person hat noch keine Zwei-Faktor-Anmeldung eingerichtet.</p> : null}
      </CardContent>
    </Card>
  );
}
