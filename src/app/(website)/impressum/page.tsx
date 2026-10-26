import type { Metadata } from "next";
import { LegalPage } from "@/components/website/legal";

export const metadata: Metadata = { title: "Impressum", alternates: { canonical: "/impressum" } };

// Inhalt vom Inhaber vorgegeben (Stand: Oktober 2026).
export default function ImprintPage() {
  return (
    <LegalPage title="Impressum">
      <h2>Angaben gemäß § 5 DDG</h2>
      <p>
        Erlen-Sales GbR
        <br />
        Kömbchesweg 26
        <br />
        57612 Helmenzen
      </p>
      <p>
        <strong className="text-white">Vertreten durch die Gesellschafter:</strong>
        <br />
        Leon Janzen
        <br />
        Mehmet Eren Ince
      </p>
      <h2>Kontakt</h2>
      <p>
        Telefon: <a href="tel:+4915144204593">+49 151 44204593</a>
        <br />
        E-Mail: <a href="mailto:kontakt@erlen-sales.de">kontakt@erlen-sales.de</a>
      </p>
      <h2>Umsatzsteuer-ID</h2>
      <p>
        Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG:
        <br />
        DE463642747
      </p>
      <h2>Haftung für Inhalte</h2>
      <p>
        Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Wir sind
        jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu
        forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung oder Sperrung der Nutzung von
        Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt. Eine Haftung ist erst ab dem Zeitpunkt der Kenntnis
        einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden entsprechender Rechtsverletzungen entfernen wir diese Inhalte
        umgehend.
      </p>
      <h2>Haftung für Links</h2>
      <p>
        Unser Angebot kann Links zu externen Websites Dritter enthalten, auf deren Inhalte wir keinen Einfluss haben. Für diese
        fremden Inhalte übernehmen wir keine Gewähr. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder
        Betreiber verantwortlich. Bei Bekanntwerden von Rechtsverletzungen entfernen wir derartige Links umgehend.
      </p>
      <h2>Urheberrecht</h2>
      <p>
        Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht.
        Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechts bedürfen
        der schriftlichen Zustimmung der Gesellschafter.
      </p>
    </LegalPage>
  );
}
