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

## Alternative: Screenshot (kostenlos)

Lässt sich die Liste nicht kopieren, einfach ein Bildschirmfoto der Liste machen:

1. Im Partner-CRM die Liste öffnen.
2. **Windows:** `Windows + Umschalt + S` drücken und die Tabelle mit der Maus umrahmen. **Mac:** `Cmd + Umschalt + 4`. **Handy:** normaler Screenshot.
3. Im Portal unter **Leistungen → Abgleich Partner-CRM** ins große Feld klicken und **Strg + V** drücken. Oder das Bild hineinziehen, oder auf **Screenshot hochladen** klicken.
4. Nach einigen Sekunden steht die Liste da. Danach wie oben prüfen und **Abgleich starten**.

Die Texterkennung läuft **kostenlos direkt im Browser**. Es gibt keinen KI-Dienst, keinen Schlüssel und keine Kosten pro Bild. Das Bild verlässt den Rechner nicht und wird nicht gespeichert.

Tipps für gute Erkennung:
* Die Tabelle möglichst groß anzeigen (`Strg + Plus`) und nur die Tabelle ausschneiden.
* Bei langen Listen mehrere Screenshots nacheinander abgleichen. Doppelte Zeilen schaden nicht.
* In der Vorschau kurz die **Auftragsnummern** prüfen. Eine falsch gelesene Ziffer würde sonst als neuer Auftrag angelegt. Kopieren und Einfügen ist immer genauer als ein Screenshot.

## Datenschutz

* Die kopierte Liste wird **im Browser** ausgewertet. Ans Portal gehen nur Auftragsnummer, Verkäufer, Produkt, Datum und Status – **Kundennamen, Adressen und Telefonnummern werden nicht übertragen und nicht gespeichert.**
* Auch Screenshots werden **im Browser** gelesen. Das Bild wird an niemanden übertragen.
* Bitte im Partnervertrag prüfen, ob ihr eure Auftragsdaten in eigene Systeme übernehmen dürft (für die eigene Provisionsabrechnung üblicherweise unproblematisch).

## Tipps

* Den Abgleich immer mit **demselben Zeitraum oder etwas Überlappung** machen (z. B. „letzte 30 Tage“) – doppelte Zeilen schaden nicht.
* Verkäufer-Kennungen beim Partner bleiben gespeichert. Ändert sich eine, einfach beim nächsten Abgleich neu zuordnen.
