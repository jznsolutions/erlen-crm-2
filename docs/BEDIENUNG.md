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
5. **Overhead:** Ausbilder erhalten automatisch Provision auf die Leistungen ihrer Auszubildenden, Teamleiter auf die Leistungen ihres Teams. Berechnungsart unten auf der Seite:
   * **Differenz** (Standard): VP 30 €, Ausbilder 40 €, Teamleiter 50 € → VP 30 €, Ausbilder 10 €, Teamleiter 10 €.
   * **Fester Betrag:** der Satz der Stufe Ausbilder/Teamleiter wird je Einheit der Struktur voll gezahlt.
   Maßgeblich ist die Zuordnung (Ausbilder, Team) zum Ende des Abrechnungszeitraums.

## Abrechnungen & Gutschriften
* Mitarbeitende finden unter **Abrechnungen & Gutschriften** alle für sie veröffentlichten Dokumente und können sie ansehen bzw. als PDF herunterladen. Bei neuen Dokumenten erhalten sie eine Benachrichtigung (und eine E-Mail, falls eingerichtet).
* **Gutschrift erstellen:** Mitarbeiter und Zeitraum (Standard: Vormonat) wählen → **Berechnen**. Automatisch enthalten: **Vermittlungsprovision** (eigene bestätigte Leistungen) sowie **Overhead Ausbilder/Teamleiter**. Darunter die **Zusatzpositionen** des Mitarbeiters (z. B. Fahrzeugrate) an- oder abwählen. Positionen können angepasst oder ergänzt werden → **Gutschrift erstellen & veröffentlichen**. Das PDF wird mit fortlaufender Nummer erzeugt.
* **Zusatzpositionen** (z. B. Fahrzeug über die Agentur): im **Mitarbeiterprofil → Zusatzpositionen für Gutschriften** anlegen (Abzug oder Zuschlag). „Bei jeder Gutschrift vorauswählen“ für monatliche Raten.
* **Belegnummern:** unten auf der Seite Abrechnungen & Gutschriften. Platzhalter `{JAHR}` und `{NR}`, z. B. `GS{JAHR}{NR}` → GS202622. Mit **Nächste Nr.** führt ihr eure bisherige Nummerierung fort (letzte war 21 → 22 eintragen).
* **Abrechnung erstellen** funktioniert genauso (eigener Nummernkreis). **PDF hochladen** für fertige Dokumente.
* Pro Zeitraum ist nur ein veröffentlichter Beleg mit Provisionen möglich (Schutz vor Doppelzahlung). Fehler? → **Stornieren** und neu erstellen.
* Anschrift, Steuernummer, USt-IdNr., IBAN und „umsatzsteuerpflichtig“ pflegen Mitarbeitende selbst im Profil unter **Abrechnungsdaten**.
* **Wichtig:** Die steuerliche Gestaltung (Pflichtangaben nach § 14 UStG, Gutschriftverfahren) bitte einmal mit eurer Steuerberatung abstimmen.

## Termine (Bewerbungsgespräche)
* Bewerber buchen auf der Website selbst einen freien Termin. Vergebene Zeiten verschwinden sofort; zwei Personen können nie denselben Termin buchen.
* Bestätigung mit Kalendereintrag an Bewerber und an eure Adresse; 2 Stunden vorher Erinnerung an beide. Bewerber können per Link absagen.
* **Termine** im Portal: anstehende Gespräche, Absagen (Bewerber wird informiert), Erreichbarkeit je Wochentag, Dauer, Vorlaufzeit, gesperrte Zeiten (Urlaub).
* Jede Buchung erscheint auch unter **Bewerber**.

## Geldbeträge verbergen
* Über das **Augen-Symbol** oben rechts lassen sich alle Geldbeträge (Umsatz, Provision, Gutschriften) verschwommen darstellen – praktisch, wenn jemand mitschaut. Ein weiterer Klick zeigt sie wieder an; die Einstellung bleibt im Browser gespeichert.

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
