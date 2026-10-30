import type { Metadata } from "next";
import { BookingCalendar } from "@/components/website/booking";

export const metadata: Metadata = {
  title: "Termin für dein Bewerbungsgespräch",
  description: "Such dir direkt einen freien Termin für dein Kennenlerngespräch mit ERLEN aus.",
  alternates: { canonical: "/termin" },
};

// Eigene Seite für den Link aus der Einladungs-Mail
export default function BookingPage() {
  return (
    <div className="mx-auto grid max-w-6xl items-start gap-12 px-5 pb-24 pt-36 sm:px-8 lg:grid-cols-2">
      <div>
        <p className="eyebrow">Termin</p>
        <h1 className="font-display mt-6 text-[2.6rem] font-black uppercase leading-[0.95] tracking-tight text-white sm:text-6xl">
          Dein Gespräch.<br /><span className="text-accent">Dein Termin.</span>
        </h1>
        <p className="mt-8 max-w-md text-lg text-white/55">
          Wähle einen freien Termin für dein unverbindliches Kennenlerngespräch. Du erhältst sofort eine Bestätigung per E-Mail und 2 Stunden vorher eine Erinnerung.
        </p>
      </div>
      <div className="glass min-w-0 rounded-[2rem] p-6 sm:p-10">
        <BookingCalendar />
        <noscript><p className="text-white/60">Für die Terminbuchung wird JavaScript benötigt.</p></noscript>
      </div>
    </div>
  );
}
