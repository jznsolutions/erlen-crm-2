# Bedienungsanleitung für Administration & Agenturleitung

## Mitarbeiter einladen
1. **Verwaltung → Benutzer & Einladungen**.
2. Vorname, Nachname, E-Mail, Rolle, Team, Vorgesetzten, Ausbilder, Gültigkeit und **freigeschaltete Produkte** wählen → **Einladung per E-Mail senden**.
3. Die Person erhält automatisch eine E-Mail mit dem Button „Konto jetzt einrichten“, legt ihr Passwort fest und ist sofort eingerichtet (Team, Vorgesetzter, Ausbilder, Produkte, Pflichtschulungen). Du erhältst eine Benachrichtigung.
4. Ist der E-Mail-Versand noch nicht eingerichtet (gelber Hinweis), wird der Link ersatzweise angezeigt. Einrichtung: `docs/EINRICHTUNG_PRODUKTION.md` → „E-Mail-Versand“.
5. Unter „Einladungen“: **Erneut senden** (neue E-Mail, 3 Tage gültig, der alte Link wird ungültig) oder **Widerrufen**.

## Produkte freischalten
* Mitarbeitende können nur für **freigeschaltete Produkte** Leistungen erfassen – auch Führungskräfte können für sie nur diese Produkte erfassen.
* Freischalten: **Mitarbeiterprofil → Produkte & Provision** → Haken setzen → **Freigaben speichern**. Die Person wird benachrichtigt.
* Neue Produkte sind zunächst für niemanden freigeschaltet.

## Provisionen
1. Produkte unter **Verwaltung → Produkte** anlegen – sie stehen danach bei den Provisionen zur Auswahl.
2. **Verwaltung → Provisionen → Provision hinzufügen:** Produkt wählen, Stufe wählen (**Vertriebspartner, Ausbilder, Teamleiter, Agentur**), Provision in Euro je bestätigter Einheit eintragen → **Hinzufügen**. Beträge lassen sich in der Liste direkt ändern oder entfernen.
3. Die Stufe eines Mitarbeiters ergibt sich aus seiner Rolle; abweichend im **Mitarbeiterprofil → Produkte & Provision** einstellbar.
4. Die Stufe **Agentur** ist euer Erlös je Einheit – daraus berechnet das Dashboard den **Umsatz**.
5. **Vermittlungsprovision & Overhead** (unten auf der Provisionen-Seite, feste Beträge je bestätigter Einheit, für alle Produkte):
   * **Vermittlungsprovision 5 €** – für den Werber: Wer einen neuen Mitarbeiter in die Agentur bringt, erhält für jede bestätigte Einheit dieser Person 5 €. Dafür im **Mitarbeiterprofil → Verwaltung → „Geworben von“** den Werber auswählen (oder schon beim Einladen).
   * **Overhead Ausbilder 10 €** – für jede Einheit der eigenen Azubis (Profil → „Ausbilder“).
   * **Overhead Teamleiter 30 €** – für jede Einheit des eigenen Teams. Ist der Ausbilder zugleich Teamleiter, erhält er die 30 €.
   * **Agentur:** kein Overhead – Agenturleiter rechnen ihre Mitarbeiter selbst bzw. individuell ab.
   * In der Gutschrift erscheinen die Beträge als „Differenzprovision“ (Ausbilder/Teamleiter) und „Vermittlungsprovision“ (Werber).
   * Maßgeblich ist die Zuordnung (Werber, Ausbilder, Team) zum Ende des Abrechnungszeitraums.

## Abrechnungen & Gutschriften
Ablauf wie in euren bisherigen Vorlagen – erst die **Provisionsabrechnung** (Einzelaufstellung), dann die **Gutschrift** (Auszahlung):

1. **Abrechnung erstellen:** Mitarbeiter und Leistungszeitraum (z. B. 03.09.–13.09.) wählen → **Berechnen**. Es erscheinen alle bestätigten Leistungen je Produkt × Provisionssatz der Stufe. Leistungen aus früheren Zeiträumen, die jetzt storniert wurden, stehen als **Minuszeile** darunter (z. B. „TNG max1000 −1 × 90 € = −90 €“). → **Abrechnung erstellen & veröffentlichen**. Das PDF heißt „Provisionsabrechnung“ und endet mit der Zwischensumme.
2. **Gutschrift erstellen:** Mitarbeiter und Leistungszeitraum (z. B. August) wählen → **Berechnen**. Automatisch vorgeschlagen:
   * **Provisionen gem. Abrechnung** – alle veröffentlichten, noch nicht abgerechneten Provisionsabrechnungen,
   * **Stornoeinbehalt Vormonat** – der Einbehalt der letzten Gutschrift wird ausgezahlt,
   * **Differenzprovision** – Overhead als Ausbilder/Teamleiter aus dem Zeitraum.
   Darunter: **Stornobehalt** (Standard 10 %), **Abzüge** wie KFZ (aus den Zusatzpositionen im Mitarbeiterprofil oder frei eingetragen), **USt. 19 %** bei umsatzsteuerpflichtigen Partnern → **GESAMTSUMME**.
3. Nach dem Veröffentlichen sind die übernommenen Abrechnungen und der ausgezahlte Einbehalt erledigt und werden nicht noch einmal vorgeschlagen. Wird die Gutschrift storniert, stehen sie wieder zur Verfügung.

* **Monatsabschluss (alle auf einmal):** Abrechnungen & Gutschriften → **Monatsabschluss** → Monat wählen (Standard: Vormonat). Die Tabelle zeigt je Mitarbeiter Provisionen, Differenz-/Vermittlungsprovision, Einbehalt Vormonat, Abzüge und Gesamtsumme samt Hinweisen (z. B. „Anschrift fehlt“). Haken setzen oder entfernen, Stornobehalt prüfen → **Abrechnungen & Gutschriften erstellen**. Für jeden wird die Provisionsabrechnung und die Gutschrift erstellt, veröffentlicht und der Mitarbeiter benachrichtigt. Wer für den Monat schon eine Gutschrift hat, ist ausgegraut.
* **Gutschriftnummer:** fortlaufend, Format `GS{JAHR}{NR}` (z. B. GS202623).
  * Beim Erstellen steht die vorgeschlagene Nummer im Feld **„Gutschriftnummer“** – einfach überschreiben, wenn ihr eine andere wollt.
  * Nachträglich: in der Liste beim Beleg **„Nummer ändern“** – das PDF wird automatisch mit der neuen Nummer erzeugt.
  * Dauerhaft fortsetzen: oben **„Nummern einstellen“** bzw. unten „Belegnummern & Voreinstellungen“ → **Nächste Nr.**
  * Jede Nummer kann nur einmal vergeben werden.
* **Kundennummer** je Mitarbeiter (z. B. VPSS001 = immer „VP“ + Initialen + laufende Nummer): wird bei der ersten Gutschrift automatisch vergeben oder im Mitarbeiterprofil eingetragen (z. B. eure bestehenden Nummern VPSS001, VPNC007). Die nächste laufende Nummer ist unter „Belegnummern & Voreinstellungen“ einstellbar.
* Stufen-Kürzel auf dem Beleg („Stufe: …“): VP = Vertriebspartner, AB = Ausbilder, TL = Teamleiter, AG = Agentur. Kundennummern beginnen unabhängig von der Stufe immer mit „VP“.
* Mitarbeitende sehen ihre veröffentlichten Belege unter **Abrechnungen & Gutschriften** und laden sie als PDF herunter.
* **PDF hochladen** für fertige Dokumente; **Stornieren** statt Löschen bei Fehlern.
* **Wichtig:** Die steuerliche Gestaltung (u. a. ob die KFZ-Rate vor der USt abgezogen werden darf, Pflichtangaben nach § 14 UStG für Gutschriften) bitte einmal mit eurer Steuerberatung abstimmen.

## Termine (Bewerbungsgespräche)
* Bewerber buchen auf der Website selbst einen freien Termin. Vergebene Zeiten verschwinden sofort; zwei Personen können nie denselben Termin buchen.
* Bestätigung mit Kalendereintrag an Bewerber und an eure Adresse; 2 Stunden vorher Erinnerung an beide. Bewerber können per Link absagen.
* **Termine** im Portal: anstehende Gespräche, Absagen (Bewerber wird informiert), Erreichbarkeit je Wochentag, Dauer, Vorlaufzeit, gesperrte Zeiten (Urlaub).
* Jede Buchung erscheint auch unter **Bewerber**.

## Start-Checkliste für neue Mitarbeiter
* Auf dem **Dashboard** sehen Mitarbeiter „**Dein Start bei ERLEN**“ mit allem, was noch fehlt: Profilbild, Telefonnummer, Anschrift, IBAN, Steuernummer/USt-IdNr., Pflicht-Unterlagen, Pflichtschulungen – und als Empfehlung Push-Benachrichtigungen. Jeder Punkt hat einen Knopf **„Erledigen“**, der direkt an die richtige Stelle führt.
* Die Checkliste verschwindet automatisch, sobald alle Pflichtpunkte erledigt sind.
* Welche Unterlagen Pflicht sind (Standard: Gewerbeanmeldung und Personalausweis), legt ihr unter **Einstellungen → Start-Checkliste** fest.
* Im **Mitarbeiterprofil** seht ihr als Verwaltung den Stand (z. B. „5 von 8 Pflichtpunkten erledigt“).

## Meine Unterlagen (Gewerbeanmeldung, Führerschein …)
* Jeder Mitarbeiter findet im Menü **Meine Unterlagen**. Dort: Art wählen (z. B. Gewerbeanmeldung, Führerschein, Personalausweis), optional Bezeichnung und „gültig bis“, dann **Datei auswählen** (PDF/Foto) oder **Foto aufnehmen** → **Hochladen**.
* Sichtbar nur für den Mitarbeiter selbst und die Verwaltung (Agenturleitung, Administration) – nicht für Teamleiter oder Ausbilder.
* Die Verwaltung erhält eine Benachrichtigung und findet alle neuen Unterlagen unter **Meine Unterlagen → Zu prüfen** sowie im **Mitarbeiterprofil → Unterlagen**. Dort **Prüfen** (✓) oder **Ablehnen** (✕, mit Grund – der Mitarbeiter wird informiert und lädt neu hoch).
* Mitarbeiter können eigene Unterlagen löschen, solange sie noch nicht geprüft sind. Abgelaufene Dokumente (Datum „gültig bis“) werden rot markiert.
* Die Verwaltung kann im Mitarbeiterprofil auch selbst Unterlagen für den Mitarbeiter hochladen.

## Benachrichtigungen aufs Handy (Push)
* Jede Benachrichtigung im Portal (z. B. **neue Gutschrift**, Leistung bestätigt/abgelehnt, neue Schulung, neuer Bewerbungstermin) kann zusätzlich als Mitteilung aufs Handy kommen – auch wenn das Portal geschlossen ist.
* Einschalten macht jeder Mitarbeiter selbst: Glocke oben rechts → **Benachrichtigungen auf diesem Gerät → Aktivieren** → „Erlauben“. Mit **Testen** kommt sofort eine Probe-Mitteilung.
* **iPhone:** Funktioniert nur, wenn das Portal auf dem Home-Bildschirm liegt: In Safari **Teilen** (Quadrat mit Pfeil) → **Zum Home-Bildschirm** → **Hinzufügen**, dann das Portal über das ERLEN-Symbol öffnen und dort aktivieren. **Android:** direkt in Chrome.
* Antippen der Mitteilung öffnet die passende Seite und markiert die Benachrichtigung als gelesen.
* Administrator einmalig: **Termine → „Erinnerungen & Push aktivieren“** (bzw. „Automatik neu einrichten“), damit Mitteilungen sofort statt erst nach bis zu 5 Minuten ankommen.

## Zwei-Faktor-Anmeldung (Code aus einer App)
* Zusätzlich zum Passwort fragt das Portal nach einem 6-stelligen Code aus einer **Authenticator-App** (z. B. Microsoft Authenticator oder Google Authenticator, kostenlos). Wer nur das Passwort kennt, kommt nicht an die Daten – das prüft auch die Datenbank selbst.
* **Selbst einrichten:** **Mein Profil → Zwei-Faktor-Anmeldung → Jetzt einrichten** → „Einrichtung starten“ → am Computer den QR-Code mit der App scannen, am Handy **In Authenticator-App öffnen** antippen → den angezeigten Code eintippen → **Einrichtung abschließen**.
* **Pflicht machen:** **Einstellungen → Zwei-Faktor-Anmeldung** → Rollen ankreuzen (Empfehlung: Systemadministrator und Agenturleiter) → **Speichern**. Vorher bei sich selbst einrichten – das Portal lässt dich sonst nicht speichern, damit du dich nicht aussperrst. Wer betroffen ist, wird bei der nächsten Anmeldung durch die Einrichtung geführt.
* **Handy verloren / neues Handy:** Ein Administrator öffnet **Mitarbeiter → Person → Zwei-Faktor-Anmeldung → Zurücksetzen**. Danach richtet die Person die App neu ein. Nur zurücksetzen, wenn du sicher bist, dass die Bitte wirklich von der Person kommt (z. B. Rückruf).
* **Einziger Administrator hat das Handy verloren:** Im Supabase-Dashboard → **Authentication → Users** → Person öffnen → beim Faktor „Delete“. Danach meldet sie sich wieder nur mit Passwort an.
* Der Code ändert sich alle 30 Sekunden. Kommt „Der Code stimmt nicht“: Uhrzeit des Handys auf „automatisch“ stellen und den aktuellen Code nehmen.

## Geldbeträge anzeigen
* Alle Geldbeträge (Umsatz, Provision, Gutschriften) sind **standardmäßig verschwommen** – praktisch, wenn jemand mitschaut.
* Ein Tipp auf das **Augen-Symbol** oben rechts zeigt sie an. Nach dem Neuladen bzw. erneuten Öffnen des Portals sind sie wieder verborgen.

## Zurück-Pfeil
* Auf allen Seiten außer dem Dashboard ist oben links (neben dem Menü) ein **Pfeil ←**. Er führt zur vorherigen Seite bzw. eine Ebene nach oben (z. B. von „Gutschrift erstellen“ zurück zu „Abrechnungen & Gutschriften“).

## Rollen und Rechte vergeben
* **Rolle ändern:** Mitarbeiter → Person öffnen → Abschnitt **Verwaltung → Rolle & Berechtigungen** → Rolle wählen → **Ändern**.
* **Einzelne Ausnahme:** im selben Abschnitt eine Berechtigung wählen und „Zusätzlich erlauben“ oder „Einschränken“. Beispiel: Ein Teamleiter soll keinen Export machen → `reports.export` einschränken.
* **Vorlagen für alle:** **Verwaltung → Rollen & Rechte** – Häkchen setzen/entfernen wirkt sofort für alle Personen der Rolle.

## Teams und Hierarchie
* **Teams** → **Team anlegen** (optional Unterteam eines anderen Teams).
* Zuordnung im **Mitarbeiterprofil → Verwaltung → Organisation**: Team + Funktion (Mitglied / Teamleitung). Bei einem neuen Team wird das alte automatisch beendet – die Historie bleibt sichtbar, Zugriffsrechte passen sich sofort an.
* Teamleitung mit „Unterteams einschließen“ sieht auch die Unterteams.
* Direkter Vorgesetzter und Ausbilder werden ebenfalls dort gesetzt.

## Konto deaktivieren / Mitarbeiter ausgeschieden
Mitarbeiterprofil → **Verwaltung → Konto → Konto deaktivieren**. Die Person verliert sofort alle Zugriffe. Später kann das Konto reaktiviert oder nach Ablauf der Aufbewahrungsfrist anonymisiert werden („Daten löschen (DSGVO)“).

## Produkte und Kennzahlen
* **Verwaltung → Produkte**: Produkte/Leistungsarten anlegen (Name, Einheit wie „Verträge“ oder „Leads“). „Vorgangs-ID ist Pflicht“ verhindert Doppelerfassungen.
* Leistungen erfassen: **Leistung erfassen** (Mitarbeitende selbst oder Führungskraft für Teammitglieder).
* **Viele auf einmal aus Excel:** **Leistungen → Importieren** → „Vorlage herunterladen“ (oder eigene Liste mit den Spalten **Mitarbeiter** (E-Mail oder Mitarbeiter-ID), **Produkt**, **Datum**, **Menge**, optional **Vorgangs-ID**, **Notiz**) → Datei wählen → **Datei prüfen**. Die Vorschau zeigt jede Zeile mit „OK“ oder dem Fehler (z. B. unbekannter Mitarbeiter). Erst **… Leistungen importieren** speichert – fehlerhafte Zeilen werden übersprungen, gleiche Vorgangs-IDs nie doppelt übernommen. Excel (.xlsx) und CSV, bis 2.000 Zeilen.
* Prüfen: **Freigaben** – bestätigen, ablehnen (mit Begründung) oder mehrere auf einmal bestätigen.
* Bestätigte Fehler: in **Leistungen** → **Stornieren** (z. B. Widerruf) oder **Korrigieren** (falsche Menge/Datum/Produkt). Alles wird protokolliert (Klick auf das Datum zeigt den Verlauf).
* Welche Zahl was bedeutet, steht in `KENNZAHLEN.md`.

## Ziele, Rankings, Wettbewerbe
* **Ziele & Rankings → Ziel anlegen**: für Person, Team oder Agentur, optional je Produkt, täglich/wöchentlich/monatlich.
* **Verwaltung → Wettbewerbe**: zeitlich begrenzte Challenges.
* **Verwaltung → Einstellungen**: Rankings an/aus und für welche Rollen sichtbar.

## ERLEN Academy
1. **Academy verwalten** → Neuer Kurs (Status „Entwurf“).
2. Kurs öffnen → **Modul** anlegen → **Lektion** anlegen (Text, Video, Dokument/PDF oder Quiz). Video/PDF nach dem Speichern über „Video hochladen“/„PDF hochladen“ ergänzen. Quizfragen über „Quizfragen bearbeiten“.
3. **Freigaben & Pflichtschulungen**: Rollen/Teams/Personen anhaken, bei Bedarf „Pflicht“. Speichern.
4. Status auf **Veröffentlicht** setzen. Freigegebene Personen werden bei neuen Lektionen benachrichtigt.
5. Ausbilder dokumentieren Fortschritt und Feedback im Profil der Auszubildenden.

## Dokumente & Mitteilungen
* **Dokumente verwalten** → Datei, Titel, Kategorie, Freigabe für Rollen/Teams → **Hochladen & freigeben**.
* **Neue Mitteilung**: Text, Empfänger (leer = alle) → alle Empfänger erhalten eine Benachrichtigung.

## Berichte & Export
**Berichte**: Filter nach Zeitraum, Team, Rolle, Mitarbeiter, Produkt, Status → Kennzahlen, Verlauf, Produkt-/Teamvergleich, Tabelle je Mitarbeiter. **CSV-Export** öffnet sich in Excel (deutsche Spaltentrennung).

## Bewerber
**Bewerber** zeigt Bewerbungen von der Website (nach Anbindung, siehe `WEBSITE_INTEGRATION.md`). Status pflegen, Notizen, **Einladen** oder löschen.

## Audit-Log
**Verwaltung → Audit-Log**: wer hat wann was geändert (nur Administratoren).
