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
1. **Verwaltung → Provisionen → Stufe anlegen** (z. B. Starter, Junior, Senior, Teamleitung).
2. In der Tabelle „Provisionssätze je Stufe und Produkt“ für jede Kombination den Betrag in Euro **je bestätigter Einheit** eintragen → **Provisionssätze speichern**. Leeres Feld = keine Provision.
3. Im **Mitarbeiterprofil → Produkte & Provision** die Stufe der Person wählen. Mitarbeitende sehen nur ihre eigene Stufe und deren Sätze.

## Abrechnungen & Gutschriften
* Mitarbeitende finden unter **Abrechnungen & Gutschriften** alle für sie veröffentlichten Dokumente und können sie ansehen bzw. als PDF herunterladen. Bei neuen Dokumenten erhalten sie eine Benachrichtigung (und eine E-Mail, falls eingerichtet).
* **Abrechnung erstellen:** Mitarbeiter und Zeitraum (Standard: Vormonat) wählen → **Berechnen**. Die Positionen ergeben sich aus den **bestätigten** Leistungen × Provisionssatz der Stufe. Positionen können angepasst oder ergänzt werden (Abzüge als negativer Betrag) → **Abrechnung erstellen & veröffentlichen**. Das PDF wird automatisch mit fortlaufender Nummer (A-2026-0001 …) erzeugt.
* **Gutschrift erstellen:** wie oben, aber mit frei wählbaren Positionen (z. B. Bonus, Prämie, Korrektur); Nummern G-2026-0001 …
* **PDF hochladen:** fertiges PDF (z. B. aus dem Buchhaltungsprogramm) für eine Person hochladen – sofort sichtbar.
* **Als Entwurf speichern:** nur für die Verwaltung sichtbar; später „Veröffentlichen“ oder „Löschen“.
* Für denselben Zeitraum ist nur **eine** veröffentlichte Abrechnung möglich (Schutz vor Doppelzahlung). Fehler? → **Stornieren** (mit Begründung, bleibt als „storniert“ sichtbar) und neu erstellen.
* Anschrift, Steuernummer, USt-IdNr., IBAN und „umsatzsteuerpflichtig“ pflegen Mitarbeitende selbst im Profil unter **Abrechnungsdaten** (oder die Verwaltung im Mitarbeiterprofil). Ohne Umsatzsteuerpflicht wird der Hinweis auf § 19 UStG gedruckt, sonst 19 % USt ausgewiesen.
* **Wichtig:** Die steuerliche Gestaltung (Pflichtangaben nach § 14 UStG, Gutschriftverfahren) bitte einmal mit eurer Steuerberatung abstimmen.

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
