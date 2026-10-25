# Kennzahlen & Zählregeln

Diese Regeln gelten überall (Dashboards, Berichte, Ziele, Rankings, Export) und sind in der Datenbank sowie in `src/lib/metrics.ts` umgesetzt und getestet.

## Status einer Leistung

| Status | Bedeutung | Zählt als Leistung? |
|---|---|---|
| Entwurf | gespeichert, noch nicht eingereicht | nein |
| Eingereicht | wartet auf Bestätigung | nein – wird als **„offen“** separat angezeigt |
| Bestätigt | geprüft und freigegeben | **ja** |
| Abgelehnt | mit Begründung zurückgewiesen; kann bearbeitet und erneut eingereicht werden | nein |
| Storniert | z. B. Widerruf; Begründung Pflicht | nein |
| Korrigiert | durch einen neuen, verknüpften Datensatz ersetzt | nein (der Ersatzdatensatz zählt) |

Ablauf: *Entwurf → Eingereicht → Bestätigt* (oder *Abgelehnt*). Bestätigte Leistungen werden nie direkt geändert, sondern **storniert** oder **korrigiert** – jeweils mit Begründung, Zeitstempel und Person im Verlauf. Erfasst eine Führungskraft für ein Teammitglied, ist die Leistung sofort bestätigt. Eigene Leistungen kann niemand selbst bestätigen. (Die Freigabepflicht lässt sich unter Einstellungen abschalten – nicht empfohlen.)

## Kennzahlen

| Kennzahl | Definition |
|---|---|
| Tages-/Wochen-/Monatsleistung | Summe der Menge bestätigter Leistungen nach Leistungsdatum (Woche ab Montag, Zeitzone Europe/Berlin) |
| Offen | Summe eingereichter, noch nicht geprüfter Leistungen |
| Gesamtleistung | Summe bestätigter Leistungen im gewählten Zeitraum |
| Ø pro aktivem Arbeitstag | bestätigte Menge ÷ Anzahl Tage mit mindestens einer bestätigten Leistung |
| Stornoquote | stornierte Menge ÷ (bestätigte + stornierte Menge) |
| Zielerreichung | bestätigte Menge in der aktuellen Zielperiode ÷ Zielwert; zusätzlich „zeitanteilig erwartet“ zur Einordnung |
| Rang | Wettkampf-Rangfolge (1, 2, 2, 4) nach bestätigter Menge im Zeitraum; nur aktive Mitarbeiter |
| Teamleistung | Leistungen, die **zum Erfassungszeitpunkt** dem Team zugeordnet waren |
| Agenturleistung | alle bestätigten Leistungen |

## Doppelte Erfassungen

* **Vorgangs-ID** (z. B. Vertragsnummer): pro Produkt nur einmal in aktiven Datensätzen (Groß-/Kleinschreibung egal). Nach Storno wieder verwendbar. Pro Produkt kann die Vorgangs-ID verpflichtend gemacht werden (empfohlen, wo verfügbar).
* Ohne Vorgangs-ID: gleiche Person + Produkt + Datum + Menge → Hinweis „Mögliche Doppelerfassung“, Speichern nur nach ausdrücklicher Bestätigung. In der Freigabeliste werden ähnliche Einreichungen markiert.

## Ziele

Ziele gelten für Mitarbeiter, Teams oder die Agentur, optional je Produkt. Periode: täglich, wöchentlich, monatlich (Zielwert je Periode) oder gesamter Zeitraum. Bei Erreichen eines persönlichen Ziels erhält die Person einmalig je Periode eine Benachrichtigung.
