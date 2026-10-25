import type { Metadata } from "next";
import { DraftNotice, LegalPage } from "@/components/website/legal";

export const metadata: Metadata = { title: "Impressum", alternates: { canonical: "/impressum" } };

// VORLAGE – die Pflichtangaben (§ 5 DDG) müssen vom Inhaber ergänzt werden.
export default function ImprintPage() {
  return (
    <LegalPage title="Impressum">
      <DraftNotice>Vorlage: Bitte die Pflichtangaben ergänzen, bevor die Website online geht (Datei <code>src/app/(website)/impressum/page.tsx</code>).</DraftNotice>
      <h2>Angaben gemäß § 5 DDG</h2>
      <p>ERLEN Vertriebsagentur<br />[Vor- und Nachname des Inhabers / Rechtsform]<br />[Straße und Hausnummer]<br />[PLZ Ort]</p>
      <h2>Kontakt</h2>
      <p>Telefon: [Telefonnummer]<br />E-Mail: [E-Mail-Adresse]</p>
      <h2>Umsatzsteuer-ID</h2>
      <p>[falls vorhanden: Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG]</p>
      <h2>Verantwortlich für den Inhalt</h2>
      <p>[Name, Anschrift]</p>
      <h2>Verbraucherstreitbeilegung</h2>
      <p>Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
    </LegalPage>
  );
}
