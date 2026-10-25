import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = { title: "Portal in Einrichtung", robots: { index: false, follow: false } };

// Wird angezeigt, solange die Datenbank (Supabase) noch nicht verbunden ist.
export default function PortalSetupPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[#0b0f1a] px-6 text-center text-white">
      <Image src="/erlen-logo.png" alt="ERLEN Vertriebsagentur" width={180} height={50} priority />
      <h1 className="text-2xl font-semibold">Das Mitarbeiterportal wird gerade eingerichtet.</h1>
      <p className="max-w-md text-white/60">Der Zugang für Mitarbeitende steht in Kürze zur Verfügung.</p>
      <Link href="/" className="rounded-full bg-white px-6 py-3 font-semibold text-[#0b0f1a]">Zur Startseite</Link>
    </div>
  );
}
