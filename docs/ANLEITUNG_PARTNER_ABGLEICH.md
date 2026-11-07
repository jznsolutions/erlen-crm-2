# Abgleich mit dem Partner-CRM (ohne Schnittstelle)

Eure Verkäufer arbeiten mit der Laufliste im CRM des Partners. Damit niemand Aufträge doppelt eintippen muss, übernimmt die Leitung die Liste regelmäßig (z. B. täglich oder 2× pro Woche) ins Portal – in zwei Minuten.

## So geht’s

1. Im **Partner-CRM** mit dem Agentur-Login die **Auftragsliste** aller Mitarbeiter öffnen (möglichst alle Einträge auf einer Seite anzeigen bzw. Filter auf den gewünschten Zeitraum).
2. In die Liste klicken, **Strg+A** (alles markieren) und **Strg+C** (kopieren). Am Mac: **cmd+A** / **cmd+C**.
3. Im Portal: **Leistungen → Abgleich Partner-CRM** → ins große Feld klicken → **Strg+V**.
4. **Beim ersten Mal** einmal zuordnen (das Portal schlägt alles vor, du prüfst nur):
   * **Spalten:** Auftragsnummer, Verkäufer, Produkt/Tarif, Status, Datum
   * **Status:** welcher Partner-Status bei euch zählt („Aktiviert“ → *Bestätigt*), noch geprüft wird („In Bearbeitung“ → *In Prüfung*), storniert ist oder ignoriert wird (z. B. „Lead“)
   * **Produkte:** Partner-Tarif → euer Produkt im Portal
   * **Verkäufer:** Verkäufernummer/Name beim Partner → Mitarbeiter
5. **Vorschau prüfen** → **Abgleich starten**.

Ab dem zweiten Mal ist alles gespeichert: **einfügen → Abgleich starten**, fertig.

## Was beim Abgleich passiert

| In der Partner-Liste | Im Portal |
|---|---|
| Neuer Auftrag | wird angelegt (beim richtigen Mitarbeiter, mit Auftragsnummer als Vorgangs-ID) |
| Status „bestätigt“ (z. B. Aktiviert) | zählt sofort – Ranking, Ziele, Provision, Gutschrift |
| Status „in Prüfung“ | wird als „eingereicht“ angelegt und später automatisch bestätigt |
| Status „storniert“ | wird bei euch storniert, der Mitarbeiter bekommt eine Info |
| Auftrag schon übernommen | wird nur aktualisiert – **nie doppelt** angelegt |

Fehlerhafte Zeilen (z. B. unbekannter Verkäufer) werden übersprungen und angezeigt – der Rest wird trotzdem übernommen.

## Alternative: Screenshot (z. B. am Handy)

Lässt sich die Liste nicht als Tabelle kopieren, auf **Screenshot hochladen** tippen. Die KI liest die Liste aus dem Bild (dafür muss der KI-Schlüssel eingerichtet sein, siehe `ANLEITUNG_KI_TRAINER.md`; ca. wenige Cent pro Bild). Danach wie oben prüfen und abgleichen. Spalten mit Kundendaten lässt die KI weg; das Bild wird nicht gespeichert.

## Datenschutz

* Die kopierte Liste wird **im Browser** ausgewertet. Ans Portal gehen nur Auftragsnummer, Verkäufer, Produkt, Datum und Status – **Kundennamen, Adressen und Telefonnummern werden nicht übertragen und nicht gespeichert.**
* Beim Screenshot wird das Bild zur Auswertung an Anthropic übertragen (siehe Datenschutz-Leitfaden).
* Bitte im Partnervertrag prüfen, ob ihr eure Auftragsdaten in eigene Systeme übernehmen dürft (für die eigene Provisionsabrechnung üblicherweise unproblematisch).

## Tipps

* Den Abgleich immer mit **demselben Zeitraum oder etwas Überlappung** machen (z. B. „letzte 30 Tage“) – doppelte Zeilen schaden nicht.
* Verkäufer-Kennungen beim Partner bleiben gespeichert. Ändert sich eine, einfach beim nächsten Abgleich neu zuordnen.
