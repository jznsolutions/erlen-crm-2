# KI-Verkaufstrainer einrichten (Schritt für Schritt)

Der KI-Verkaufstrainer (Academy → **KI-Verkaufstrainer**) nutzt das KI-Modell **Claude** von Anthropic. Damit er funktioniert, braucht das Portal einen eigenen **API-Schlüssel** von Anthropic. Dauer: ca. 10 Minuten.

> Den Schlüssel nur bei Anthropic und Vercel eintippen – nie in einen Chat, eine E-Mail oder eine Datei.

## Teil 1 – Konto und Schlüssel bei Anthropic

1. Öffne <https://console.anthropic.com> und lege ein Konto an (am besten mit eurer Firmen-E-Mail).
2. **Plans & Billing** (bzw. **Billing**): Zahlungsmethode hinterlegen und Guthaben aufladen, z. B. 20 €.
3. **Limits**: ein **Monatslimit** festlegen (z. B. 50 €). Dann können nie mehr Kosten entstehen.
4. **API Keys** → **Create Key** → Name `ERLEN Portal` → **Create**. Den angezeigten Schlüssel (beginnt mit `sk-ant-`) **sofort kopieren** – er wird nur einmal gezeigt.

## Teil 2 – Schlüssel bei Vercel eintragen

5. <https://vercel.com> → euer Projekt → **Settings → Environment Variables**.
6. **Key:** `ANTHROPIC_API_KEY`, **Value:** den kopierten Schlüssel, Typ **Secret** → **Save**.
7. **Deployments** → oberster Eintrag **⋯ → Redeploy**.
8. Portal → **Academy → KI-Verkaufstrainer** → ein kurzes Übungsgespräch führen. Kommt eine Antwort vom „Kunden“, ist alles fertig.

## Kosten (Richtwerte, keine Garantie)

* Abgerechnet wird nach Nutzung (Modell Claude Opus 5.5, laut Anthropic-Preisliste 4 $ pro 1 Mio. Eingabe-Tokens und 20 $ pro 1 Mio. Ausgabe-Tokens).
* Ein komplettes Übungsgespräch (ca. 10–15 Nachrichten plus Bewertung) kostet nach unserer Schätzung **etwa 0,20–0,50 €**. Bei 20 Mitarbeitern mit je 10 Trainings im Monat wären das grob **40–100 € im Monat**.
* Das Monatslimit aus Schritt 3 deckelt die Kosten sicher. Den Verbrauch seht ihr in der Anthropic-Konsole unter **Usage**.
* Schutz im Portal: höchstens 120 KI-Anfragen pro Person und Stunde; jede Nachricht max. 1.200 Zeichen, ein Gespräch max. 40 Nachrichten.

## Datenschutz

* Die Übungsgespräche werden zur Antwort an Anthropic übertragen. **Keine echten Kundendaten** eingeben (der Trainer weist darauf hin).
* Im Portal gespeichert werden nur Situation, Schwierigkeit, Note und Feedback – **nicht** das Gespräch selbst. Sichtbar für die Person und alle, die ihren Lernfortschritt sehen dürfen (Ausbilder, Teamleitung, Agenturleitung).
* Anthropic in den Datenschutz-Leitfaden aufnehmen (`docs/DATENSCHUTZ_AVV_ANLEITUNG.md`): Der Auftragsverarbeitungsvertrag (DPA) ist laut Anthropic Teil der kommerziellen Bedingungen der API – bitte in der Konsole bzw. auf <https://www.anthropic.com/legal> prüfen und ablegen.

## Was der Trainer kann

* Drei Situationen: **Glasfaser an der Haustür**, **Strom- und Gaswechsel**, **Photovoltaik-Beratung** – jeweils **leicht / mittel / schwer**.
* Der KI-Kunde bringt typische Einwände und reagiert realistisch: gute Fragen machen ihn offener, Druck macht ihn skeptisch.
* Nach „Gespräch beenden & bewerten“: Note 0–100, Ergebnis (Abschluss/Termin/offen/abgelehnt), Einzelnoten (Einstieg, Bedarfsfragen, Einwandbehandlung, Abschluss), Stärken, Verbesserungen und **bessere Formulierungen** für konkrete Stellen.
