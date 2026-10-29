# Website & Portal unter einer Domain

Die öffentliche Website und das Mitarbeiterportal sind **eine Anwendung** unter **einer Domain** (`www.erlen-sales.de`):

| Adresse | Für wen | Suchmaschinen |
|---|---|---|
| `/` – Startseite mit Bewerbung | alle Besucher | indexiert (Titel, Beschreibung, strukturierte Daten, Sitemap) |
| `/impressum`, `/datenschutz` | alle | indexiert |
| `/login` (dezent im Kopf- und Fußbereich verlinkt) | Mitarbeitende | **gesperrt** (`noindex`, `robots.txt`) |
| `/dashboard`, `/academy`, `/admin/…` usw. | nur angemeldete, aktive Konten | **gesperrt**; ohne Anmeldung Umleitung auf `/login` |

Fremde Besucher landen auf der Startseite. Das Portal ist nur mit einem per Einladung angelegten Konto nutzbar – es gibt keine Registrierung. Wer `/login` aufruft, sieht nur das Anmeldeformular.

## Inhalte anpassen

* **Texte der Startseite:** `src/app/(website)/page.tsx` (Hero, Laufband, Kennzahlen, Über ERLEN, Märkte, Karrierepfad, Vorteile, Quiz, Erfolgsgeschichten, Ablauf, FAQ, Bewerbung, Kontakt). Animationen und Display-Schrift: `src/app/(website)/website.css`.
* **Optionale Abschnitte** in `src/lib/site.ts` – erscheinen erst mit echten Inhalten: Einkommensangaben je Karrierestufe (`careerLevels[].income`), Erfolgsgeschichten (`testimonials`, nur mit Einverständnis der Personen), Partner/Auftraggeber (`partners`, nur mit Erlaubnis), Standort/Kontakt (`address`, `email`, `phone`).
* **Quiz** „Passt ERLEN zu dir?“: `src/components/website/quiz.tsx`. Die Antworten werden nur bei einer Bewerbung als Nachricht mitgesendet.
* **Kontaktdaten, WhatsApp, Kennzahlen:** `src/lib/site.ts`. Felder mit `null` werden ausgeblendet.
* **Impressum und Datenschutz:** `src/app/(website)/impressum/page.tsx` und `…/datenschutz/page.tsx` – **Vorlagen, vor dem Livegang vervollständigen und prüfen lassen.**

## Bewerbungen

Das Formular auf der Startseite speichert Bewerbungen direkt im Portal (Bereich **Bewerber**), mit Einwilligungspflicht, Spam-Schutz (Honeypot) und Ratenbegrenzung. Nach dem Absenden erscheint direkt der eigene Terminkalender (Name, E-Mail, Telefon vorausgefüllt); zusätzlich gibt es den Bereich „Termin“ (`/#termin`). Verwaltung im Portal unter **Termine**.

Für externe Formulare gibt es zusätzlich den Endpunkt `POST /api/public/bewerbung` (JSON: `full_name`, `email`, `phone`, `consent: true`, optional `message`); erlaubte Absender-Domains über `APPLICATION_ALLOWED_ORIGINS`.

## Umzug der bisherigen Website

Die alte statische Seite (`Erlen-Page-2.0`) wurde nicht verändert. Zum Umstellen die Domain `erlen-sales.de` bzw. `www.erlen-sales.de` in Vercel diesem Projekt zuordnen (siehe `EINRICHTUNG_PRODUKTION.md`, Schritt 5). Danach kann das alte Hosting abgeschaltet werden.
