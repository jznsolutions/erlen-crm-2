# Abgleich mit dem Partner-CRM (ohne Schnittstelle)

Es gibt zwei Wege – je nachdem, was das Partner-CRM zeigt:

* **A) Übersicht je Verkäufer (Screenshot)** – der Normalfall: Das Partner-CRM zeigt je Verkäufer nur Zahlen (Gesamt, Qualifiziert, Anzahl Module …). → unten „Teil A“.
* **B) Auftragsliste** – falls es eine Liste mit Auftragsnummern gibt. → „Teil B“.

# Teil A: Übersicht je Verkäufer (jeden Morgen, ca. 2 Minuten)

Das Partner-CRM zeigt je Verkäufer, wie viele Leads **qualifiziert** sind, aufgeteilt nach **Modul-Kategorie** (Dachfläche), z. B. „15-39 Module · 50 %“ mit „2 / 2“. Die **erste Zahl** (qualifiziert) wird vergütet. Leads werden oft erst nach 1–2 Wochen qualifiziert – deshalb jeden Morgen den aktuellen Stand hochladen. Das Portal bucht **nur den Unterschied** zum letzten Mal:

| Gestern | Heute | Was das Portal macht |
|---|---|---|
| 3 | 7 | 4 neue Leads, bestätigt, mit heutigem Datum |
| 7 | 7 | nichts (derselbe Screenshot zweimal schadet nicht) |
| 7 | 6 | 1 Lead wird storniert |

## Einmalig vorbereiten

1. **Verwaltung → Produkte**: ein Produkt „PV-Lead“ anlegen und darunter drei **Provisionsstufen** hinzufügen: „bis 14 Module“, „15-39 Module“, „ab 40 Module“. Die Zahlen im Namen genügen – der Abgleich ordnet die Kategorien aus dem Screenshot dann automatisch zu.
2. **Verwaltung → Provisionen**: in den drei Zeilen „PV-Lead – …“ die Beträge je Rang eintragen und speichern.
3. Datenbank-Update auf `/einrichtung` einspielen (falls das Portal darauf hinweist).

## Jeden Morgen

1. Im Partner-CRM die Karte eines Verkäufers **aufklappen**, so weit scrollen, dass Name **und** „Anzahl Module“ zu sehen sind (gern auch zwei Bilder) → **Screenshot**. Das für alle Verkäufer wiederholen.
2. Im Portal (Handy oder PC): **Leistungen → Abgleich Partner-CRM** → **Screenshots auswählen** → alle Bilder von heute auf einmal markieren. Am PC geht auch Strg+V oder Hineinziehen.
3. Kurz prüfen: Verkäufer richtig erkannt? Zahlen richtig? (Gelb markierte Zahlen bitte anschauen – alle Zahlen kann man direkt korrigieren.)
4. **Beim ersten Mal**: prüfen, ob die Modul-Kategorien den richtigen Provisionsstufen zugeordnet sind (passiert automatisch). Das Produkt wird für die Verkäufer automatisch freigeschaltet. Wurden die bisherigen Leads schon von Hand erfasst, den Haken „nur als Startwert merken“ setzen.
5. **Übernehmen** – fertig. Die Verkäufer sehen ihre Leads sofort in Ranking, Zielen und Provision.

Die Bilder werden kostenlos **im Browser** gelesen und nirgendwohin geschickt; übernommen werden nur Verkäufer, Kategorie und Anzahl.

**Wichtig:** Das funktioniert, wenn die Zahlen im Partner-CRM **Gesamtzahlen seit Beginn** sind. Zeigt das Partner-CRM nur den aktuellen Monat (Zahlen fallen am Monatsanfang auf 0), würde das Portal am Monatsanfang alles stornieren – die Vorschau zeigt das vorher rot („Storno“) an. In dem Fall bitte melden, dann wird das umgestellt.

## Vertriebspartner erfassen selbst nichts

Vertriebspartner, Ausbilder und Teamleiter können vorerst **keine eigenen Leistungen** mehr eintragen – das läuft komplett über den Abgleich. Wieder einschalten: **Administration → Rollen** → bei der Rolle „Eigene Leistungen erfassen“ anhaken.

# Teil B: Auftragsliste (Kopieren/Einfügen)

Im Abgleich oben auf **„Auftragsliste (Kopieren/Einfügen)“** umschalten.

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
