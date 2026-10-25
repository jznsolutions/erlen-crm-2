import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Impressum" };

export default function ImprintPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-12 text-sm">
      <h1 className="text-2xl font-semibold">Impressum</h1>
      <p className="rounded-md border border-warning/30 bg-warning-soft p-3 text-warning">Vorlage – bitte mit den Angaben aus dem Impressum der ERLEN-Website ergänzen.</p>
      <p>ERLEN Vertriebsagentur<br />[Inhaber / Rechtsform]<br />[Straße Nr.]<br />[PLZ Ort]</p>
      <p>E-Mail: [E-Mail]</p>
      <p><Link href="/login" className="underline">Zur Anmeldung</Link></p>
    </main>
  );
}
