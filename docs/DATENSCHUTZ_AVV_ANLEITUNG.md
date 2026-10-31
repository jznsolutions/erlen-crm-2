# Datenschutz-Leitfaden: Auftragsverarbeitung (AVV) & Co.

Diese Anleitung zeigt, **welche Dienste** im ERLEN-Portal personenbezogene Daten verarbeiten, **wo** du die Auftragsverarbeitungsverträge (AVV, englisch „DPA“) findest und **was** sonst noch zu erledigen ist.

> **Wichtig:** Das ist eine technische Arbeitshilfe und **keine Rechtsberatung**. Ob ERLEN damit alle Pflichten der DSGVO erfüllt, kann nur eine fachkundige Person beurteilen (Datenschutzbeauftragte/r, Anwalt/Anwältin, ggf. Steuerberatung für die Belege). Bitte lass die Punkte unten einmal prüfen, bevor ihr echte Mitarbeiter- und Bewerberdaten in größerem Umfang verarbeitet.

---

## 1. Welche Dienste verarbeiten welche Daten?

| Dienst | Wofür im Portal | Welche Daten | AVV nötig? |
|---|---|---|---|
| **Supabase** (Datenbank, Anmeldung, Dateispeicher) | Alles, was im Portal gespeichert wird | Mitarbeiterprofile, Leistungen, Provisionen, Abrechnungen, Unterlagen (Ausweis, Gewerbeanmeldung …), Bewerber, Termine, Audit-Log | **Ja** |
| **Vercel** (Hosting der Website und des Portals) | Ausliefern der Seiten, Server-Funktionen | Alle Daten laufen bei jedem Aufruf durch; Server-Protokolle (IP-Adressen, Zeitpunkte) | **Ja** |
| **Microsoft 365 / Outlook** (E-Mail-Versand) | Einladungen, Terminbestätigungen, Gutschrift-Hinweise, Monatsbericht | Name und E-Mail der Empfänger, Inhalt der Mails (inkl. PDF-Anhang Monatsbericht) | **Ja** – ist bei Microsoft 365 im Vertrag enthalten |
| **Push-Dienste** von Apple, Google, Mozilla | Mitteilungen aufs Handy | Nur verschlüsselte Nachrichten an eine Geräte-Adresse; die Dienste können den Inhalt nicht lesen (Web-Push-Verschlüsselung) | In der Regel nein (kein Auftrag an ERLEN) – in der Datenschutzerklärung erwähnen |
| **Google Search Console** | Sichtbarkeit der Website bei Google | Nur Daten über die öffentliche Website (Suchanfragen, Klicks) – **keine** Portal-Daten | Nein |
| **GitHub** | Quellcode | Kein Personenbezug (keine echten Daten im Code) | Nein |

Schriftarten werden **selbst ausgeliefert** (kein Abruf bei Google Fonts), es gibt **keine Tracking- oder Werbe-Cookies**. Das Portal setzt nur technisch notwendige Anmelde-Cookies.

---

## 2. AVV abschließen – Schritt für Schritt

### Supabase
1. <https://supabase.com/dashboard> öffnen und anmelden.
2. Links unten bzw. oben auf eure **Organisation** → **Settings** → **Legal Documents**.
3. Dort das **DPA** anfordern. Supabase schickt ein Dokument über *PandaDoc* zum digitalen Unterschreiben. Laut Supabase wird der Vertrag erst damit verbindlich ([Supabase DPA](https://supabase.com/legal/dpa)).
4. Firmendaten (Erlen-Sales GbR, Anschrift) eintragen, unterschreiben, das fertige PDF ablegen (z. B. im Ordner „Datenschutz“).
5. **Region prüfen:** Projekt öffnen → **Project Settings → General** → *Region*. Empfohlen: **Central EU (Frankfurt)**. Notiere die Region für Schritt 3 (Vercel) und das Verzeichnis (Abschnitt 4).

### Vercel
1. Der AVV von Vercel ([Vercel DPA](https://vercel.com/legal/dpa)) gilt laut aktueller Fassung für Kunden im **Pro- oder Enterprise-Tarif** und wird mit den Vertragsbedingungen wirksam (kein separates Unterschreiben).
2. **Tarif prüfen:** Vercel → Team-/Kontoeinstellungen → **Billing**. Steht dort **Hobby**: Der Hobby-Tarif ist laut Vercel für private, nicht-kommerzielle Nutzung gedacht und vom AVV nicht erfasst. Für den Geschäftsbetrieb auf **Pro** wechseln.
3. PDF des DPA herunterladen und ablegen.
4. **Server-Region einstellen** (wenn Supabase in Frankfurt liegt): Projekt `erlen-crm-2-ql3u` → **Settings → Functions → Function Regions** → **Frankfurt, Germany (fra1)** wählen → speichern → unter **Deployments** einmal **Redeploy**. Standard bei Vercel ist sonst Washington (USA). Danach im Deployment prüfen, dass „fra1“ angezeigt wird.
5. Die Unterauftragnehmer von Vercel stehen unter <https://security.vercel.com> – Link ins Verzeichnis übernehmen.

### Microsoft 365
1. Der AVV ist bei Microsoft 365 Business automatisch Teil des Vertrags („Microsoft Products and Services Data Protection Addendum“, DPA). Du musst nichts unterschreiben.
2. Herunterladen und ablegen: Microsoft Service Trust Portal (<https://servicetrust.microsoft.com>) → nach „Data Protection Addendum“ suchen.
3. Optional: Im Microsoft 365 Admin Center unter **Einstellungen → Organisationsprofil → Datenspeicherort** nachsehen, wo eure Postfächer liegen (bei deutschen Kunden meist Deutschland/EU).

### Datenübermittlung in die USA
Supabase, Vercel und Microsoft sind US-Unternehmen. Im jeweiligen AVV steht, worauf die Übermittlung gestützt wird (z. B. EU-US Data Privacy Framework oder Standardvertragsklauseln). Bitte diese Stelle bei der Prüfung durch eure Datenschutz-Fachperson ansehen lassen und in der Datenschutzerklärung nennen.

---

## 3. Weitere Pflichten (Checkliste)

* [ ] **AVV Supabase** unterschrieben und abgelegt
* [ ] **Vercel** im Pro-Tarif, DPA abgelegt, Function-Region Frankfurt
* [ ] **Microsoft DPA** abgelegt
* [ ] **Verzeichnis von Verarbeitungstätigkeiten** angelegt (Vorlage unten)
* [ ] **Datenschutzerklärung der Website** (`/datenschutz`) prüfen lassen: Hosting (Vercel), Bewerbungsformular und Terminbuchung (Supabase), E-Mail-Versand (Microsoft), Push-Mitteilungen
* [ ] **Information der Mitarbeitenden** (Art. 13 DSGVO): Welche Daten das Portal speichert – Leistungen, Rankings, Provisionen, Unterlagen, Zwei-Faktor-Anmeldung, Push. Am einfachsten als PDF bei der Einladung oder im Bereich **Dokumente** veröffentlichen.
* [ ] **Bewerber-Information**: steht bereits als Einwilligungstext im Bewerbungs- und Terminformular; Inhalt prüfen lassen
* [ ] **Löschfristen** festlegen und einhalten (siehe `SICHERHEIT_DATENSCHUTZ.md` → Löschkonzept). Bewerbungen spätestens nach 6 Monaten löschen; ausgeschiedene Mitarbeiter nach Ablauf der Aufbewahrungsfrist im Profil „Daten löschen (DSGVO)“
* [ ] **Zwei-Faktor-Anmeldung** für Systemadministrator und Agenturleiter verpflichtend machen (**Einstellungen → Zwei-Faktor-Anmeldung**); 2FA auch bei Supabase, Vercel, GitHub und Microsoft aktivieren
* [ ] **Leistungs-Tracking und Rankings**: Mitarbeitende vorab informieren; prüfen lassen, ob eine Einwilligung oder vertragliche Grundlage nötig ist (Rankings lassen sich unter **Einstellungen** je Rolle abschalten)
* [ ] **Ausweiskopien**: nur speichern, wenn ihr sie wirklich braucht; ggf. nicht benötigte Angaben schwärzen lassen
* [ ] **Datenpannen-Plan**: Wer meldet was innerhalb von 72 Stunden an die zuständige Datenschutz-Aufsichtsbehörde eures Bundeslandes (je nach Firmensitz)?

---

## 4. Vorlage: Verzeichnis von Verarbeitungstätigkeiten

Für jede Zeile ein Eintrag im Verzeichnis (Word/Excel genügt). Die technischen Maßnahmen (TOM) stehen ausführlich in `SICHERHEIT_DATENSCHUTZ.md`.

| Verarbeitung | Zweck | Betroffene | Daten | Empfänger / Auftragsverarbeiter | Löschfrist (Vorschlag – prüfen!) |
|---|---|---|---|---|---|
| Mitarbeiterportal | Zusammenarbeit, Schulung, Organisation | Vertriebspartner, Leitung | Name, E-Mail, Telefon, Rolle, Team, Profilbild | Supabase, Vercel | Bis Ende der Zusammenarbeit + gesetzliche Aufbewahrung |
| Leistungserfassung & Rankings | Leistungsnachweis, Provisionsberechnung, Motivation | Vertriebspartner | Abschlüsse je Produkt/Datum, Vorgangs-ID, Stornos | Supabase, Vercel | Wie Abrechnungsunterlagen |
| Provisionsabrechnung & Gutschriften | Vergütung | Vertriebspartner | Anschrift, Steuernummer/USt-IdNr., IBAN, Beträge | Supabase, Vercel, Microsoft (E-Mail-Hinweis) | Steuerliche Aufbewahrung (i. d. R. 8–10 Jahre – mit Steuerberatung klären) |
| Mitarbeiter-Unterlagen | Nachweise (Gewerbe, Führerschein, Ausweis) | Vertriebspartner | Dokumente/Fotos, Gültigkeitsdatum | Supabase, Vercel | Bis Ende der Zusammenarbeit, Ausweise so kurz wie möglich |
| Bewerbermanagement & Terminbuchung | Auswahl neuer Vertriebspartner | Bewerberinnen und Bewerber | Name, E-Mail, Telefon, Nachricht, Termin, Notizen | Supabase, Vercel, Microsoft | Max. 6 Monate nach Abschluss |
| E-Mail-Versand | Einladungen, Bestätigungen, Berichte | Mitarbeitende, Bewerber | Name, E-Mail, Mailinhalt | Microsoft | Nach Postfach-Richtlinie |
| Push-Mitteilungen | Benachrichtigung aufs Handy | Mitarbeitende | Geräte-Adresse (Push-Abo) | Push-Dienst des Browsers (Apple/Google/Mozilla) | Bis zum Abmelden des Geräts |
| Sicherheit & Protokoll | Nachvollziehbarkeit, Missbrauchsschutz | Alle Nutzer | Audit-Log, Anmeldezeitpunkte, gehashte IP für Ratenbegrenzung | Supabase, Vercel | Audit-Log z. B. 3 Jahre |

---

## 5. Wo liegt was im Portal?

* **Rechte & Sichtbarkeit:** Unterlagen und Abrechnungsdaten sehen nur die Person selbst und die Verwaltung (Agenturleitung/Administration).
* **Audit-Log:** **Verwaltung → Audit-Log** – wer hat wann was geändert.
* **Daten löschen:** Mitarbeiterprofil → **Daten löschen (DSGVO)** (nach Deaktivierung); Bewerber einzeln in der Pipeline löschen.
* **Datenexport für Auskunftsanfragen:** Leistungen über **Berichte → CSV-Export**, Unterlagen und Abrechnungen im Mitarbeiterprofil herunterladen.
