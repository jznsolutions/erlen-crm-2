import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { getSetupStatus } from "@/lib/setup";
import { Alert } from "@/components/ui/misc";
import { AdminForm, InitButton } from "./setup-client";

export const metadata: Metadata = { title: "Einrichtung", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function Step({ done, failed, title, children }: { done: boolean; failed?: boolean; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      {done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" /> : failed ? <XCircle className="mt-0.5 size-5 shrink-0 text-danger" /> : <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
      <div className="flex-1">
        <p className="font-medium">{title}</p>
        {children ? <div className="mt-2 text-sm text-muted-foreground">{children}</div> : null}
      </div>
    </li>
  );
}

// Einmalige Ersteinrichtung des Portals. Funktioniert nur, solange die Datenbank leer ist
// bzw. noch kein Administrator existiert – danach ist die Seite wirkungslos.
export default async function SetupPage() {
  const s = await getSetupStatus();
  const connected = s.supabase && s.secret && s.database && !s.error;
  return (
    <div className="flex min-h-dvh items-center justify-center portal-bg px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex justify-center"><Image src="/erlen-logo.png" alt="ERLEN" width={170} height={48} priority /></div>
        <div className="glass-card rounded-3xl border border-white/10 p-6 shadow-2xl sm:p-8">
          <h1 className="text-xl font-semibold">Portal einrichten</h1>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">Drei Schritte – danach kannst du dich anmelden.</p>
          <ol className="space-y-6">
            <Step done={connected} failed={!connected} title="1. Supabase ist mit Vercel verbunden">
              {!connected ? (
                <Alert tone="warning">
                  {s.error ?? "Es fehlen Zugangsdaten in Vercel:"}
                  <ul className="mt-1 list-disc pl-5">
                    {!s.supabase ? <li>Supabase-Adresse/öffentlicher Schlüssel</li> : null}
                    {!s.secret ? <li>Geheimer Schlüssel (SUPABASE_SERVICE_ROLE_KEY)</li> : null}
                    {!s.database ? <li>Datenbankverbindung (POSTGRES_URL_NON_POOLING)</li> : null}
                  </ul>
                  <p className="mt-2">Lösung: In Vercel die Supabase-Integration verbinden und danach unter „Deployments“ einmal „Redeploy“ ausführen.</p>
                </Alert>
              ) : null}
            </Step>
            <Step done={s.initialized} title="2. Datenbank einrichten">
              {connected && !s.initialized ? (
                <>
                  <p className="mb-3">Legt alle Tabellen, Rollen, Rechte und Sicherheitsregeln an. Nur einmal nötig.</p>
                  <InitButton />
                </>
              ) : null}
            </Step>
            <Step done={s.hasAdmin} title="3. Dein Administrator-Konto anlegen">
              {s.initialized && !s.hasAdmin ? <AdminForm /> : null}
            </Step>
          </ol>
          {s.initialized && s.pending.length ? (
            <div className="mt-8 space-y-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
              <p className="font-medium">Update für die Datenbank verfügbar</p>
              <p className="text-sm text-muted-foreground">
                Neue Funktionen (z. B. Provisionen, Produktfreigaben, Abrechnungen &amp; Gutschriften) brauchen eine Erweiterung der
                Datenbank. Bestehende Daten bleiben erhalten.
                {s.hasAdmin ? " Dafür musst du als Administrator angemeldet sein." : null}
              </p>
              <InitButton update />
            </div>
          ) : null}
          {s.hasAdmin ? (
            <div className="mt-8 space-y-3">
              <Alert tone="success" title="Fertig eingerichtet">Melde dich jetzt mit deiner E-Mail-Adresse und deinem Passwort an.</Alert>
              <Link href="/login" className="flex h-11 w-full items-center justify-center rounded-full bg-primary font-medium text-primary-foreground">Zum Login</Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
