import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Datenschutzhinweise" };

// VORLAGE – vor dem Produktivbetrieb rechtlich prüfen und vervollständigen lassen.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-12 text-sm leading-relaxed">
      <h1 className="text-2xl font-semibold">Datenschutzhinweise für das ERLEN-Mitarbeiterportal</h1>
      <p className="rounded-md border border-warning/30 bg-warning-soft p-3 text-warning">Entwurf – dieser Text ist eine Vorlage und muss vor dem Produktivbetrieb durch eine fachkundige Person (z. B. Datenschutzbeauftragte/r oder Rechtsberatung) geprüft und ergänzt werden.</p>
      <h2 className="pt-2 text-lg font-semibold">1. Verantwortlicher</h2>
      <p>ERLEN Vertriebsagentur, [Anschrift], [E-Mail]. (Bitte ergänzen.)</p>
      <h2 className="pt-2 text-lg font-semibold">2. Zweck der Verarbeitung</h2>
      <p>Das Portal dient der Organisation der Zusammenarbeit: Verwaltung von Mitarbeiterkonten, Teamzuordnungen, Erfassung und Auswertung von Vertriebsleistungen, Zielen, Schulungen und internen Dokumenten.</p>
      <h2 className="pt-2 text-lg font-semibold">3. Verarbeitete Daten</h2>
      <p>Name, geschäftliche E-Mail-Adresse, optional Telefonnummer und Profilbild, Rolle, Team- und Vorgesetztenzuordnung, Eintrittsdatum, Vertriebsgebiet, erfasste Vertriebsleistungen, Lernfortschritte, Anmelde- und Änderungsprotokolle.</p>
      <h2 className="pt-2 text-lg font-semibold">4. Zugriff</h2>
      <p>Der Zugriff ist rollenbasiert beschränkt: Mitarbeiter sehen ihre eigenen Daten; Ausbilder und Teamleiter nur die ihnen zugeordneten Personen; die Agenturleitung agenturweite Kennzahlen. Bestenlisten zeigen nur Vornamen, abgekürzte Nachnamen und bestätigte Leistungswerte.</p>
      <h2 className="pt-2 text-lg font-semibold">5. Auftragsverarbeiter und Speicherort</h2>
      <p>Hosting: Vercel Inc.; Datenbank, Authentifizierung und Dateiablage: Supabase Inc. (Region bitte angeben, empfohlen: EU/Frankfurt). Mit beiden Anbietern sind Auftragsverarbeitungsverträge abzuschließen.</p>
      <h2 className="pt-2 text-lg font-semibold">6. Speicherdauer und Löschung</h2>
      <p>Nach Ausscheiden wird das Konto deaktiviert. Personenbezogene Daten werden nach Ablauf der gesetzlichen Aufbewahrungsfristen anonymisiert; Leistungsdaten bleiben anonym für Auswertungen erhalten. Bewerbungsdaten werden spätestens 6 Monate nach Abschluss gelöscht.</p>
      <h2 className="pt-2 text-lg font-semibold">7. Rechte</h2>
      <p>Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch und Beschwerde bei einer Aufsichtsbehörde. Anfragen bitte an [E-Mail].</p>
      <p className="pt-4"><Link href="/login" className="underline">Zur Anmeldung</Link></p>
    </main>
  );
}
