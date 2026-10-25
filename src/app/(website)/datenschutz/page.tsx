import type { Metadata } from "next";
import { DraftNotice, LegalPage } from "@/components/website/legal";

export const metadata: Metadata = { title: "Datenschutzerklärung", alternates: { canonical: "/datenschutz" } };

// VORLAGE – vor Veröffentlichung rechtlich prüfen und vervollständigen lassen.
export default function PrivacyPage() {
  return (
    <LegalPage title="Datenschutzerklärung">
      <DraftNotice>Entwurf: Dieser Text ist eine Vorlage und muss vor der Veröffentlichung durch eine fachkundige Person (Datenschutzbeauftragte/r oder Rechtsberatung) geprüft und ergänzt werden.</DraftNotice>
      <h2>1. Verantwortlicher</h2>
      <p>ERLEN Vertriebsagentur, [Anschrift], [E-Mail]. (Bitte ergänzen.)</p>
      <h2>2. Hosting und Server-Logs</h2>
      <p>Die Website wird bei Vercel Inc. betrieben, Datenbank und Dateien bei Supabase Inc. (Region: [bitte angeben, empfohlen EU/Frankfurt]). Beim Aufruf werden technisch notwendige Daten (z. B. IP-Adresse, Zeitpunkt, aufgerufene Seite) verarbeitet, um die Website sicher bereitzustellen (Art. 6 Abs. 1 lit. f DSGVO). Mit den Anbietern bestehen Auftragsverarbeitungsverträge.</p>
      <h2>3. Cookies und Tracking</h2>
      <p>Die öffentliche Website verwendet keine Tracking- oder Werbe-Cookies und keine Analyse-Tools. Im internen Mitarbeiterportal werden ausschließlich technisch notwendige Cookies für die Anmeldung gesetzt.</p>
      <h2>4. Bewerbungsformular</h2>
      <p>Wenn du dich über das Formular bewirbst, verarbeiten wir Name, Telefonnummer, E-Mail-Adresse und deine optionale Nachricht, um deine Bewerbung zu bearbeiten und dich zu kontaktieren (Art. 6 Abs. 1 lit. a und b DSGVO, § 26 BDSG). Zum Schutz vor Missbrauch wird deine IP-Adresse nur in gehashter, nicht rückführbarer Form kurzzeitig für eine Ratenbegrenzung genutzt. Bewerbungsdaten werden spätestens 6 Monate nach Abschluss des Verfahrens gelöscht, sofern kein Beschäftigungsverhältnis entsteht. Deine Einwilligung kannst du jederzeit mit Wirkung für die Zukunft widerrufen.</p>
      <h2>5. Mitarbeiterportal</h2>
      <p>Das interne Portal ist ausschließlich für eingeladene Mitarbeitende zugänglich. Verarbeitet werden Konto- und Profildaten, Team- und Vorgesetztenzuordnungen, Vertriebsleistungen, Ziele, Lernfortschritte und Änderungsprotokolle zur Organisation der Zusammenarbeit. Der Zugriff ist rollenbasiert beschränkt. Details erhalten Mitarbeitende im Rahmen des Onboardings.</p>
      <h2>6. WhatsApp und Terminbuchung</h2>
      <p>Falls du uns über WhatsApp kontaktierst oder einen Termin über einen externen Buchungsdienst vereinbarst, gelten zusätzlich die Datenschutzbestimmungen dieser Anbieter. (Bitte an die tatsächlich genutzten Dienste anpassen.)</p>
      <h2>7. Deine Rechte</h2>
      <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie das Recht auf Beschwerde bei einer Datenschutz-Aufsichtsbehörde. Anfragen bitte an [E-Mail].</p>
    </LegalPage>
  );
}
