# Bedienungsanleitung für Administration & Agenturleitung

## Mitarbeiter einladen
1. **Verwaltung → Benutzer & Einladungen**.
2. Vorname, Nachname, geschäftliche E-Mail, Rolle, Team, Vorgesetzten, Ausbilder und Gültigkeit wählen → **Einladung erstellen**.
3. Ist E-Mail-Versand eingerichtet, erhält die Person den Link automatisch. Sonst wird der Link **einmalig angezeigt** → kopieren und z. B. per WhatsApp oder E-Mail direkt an die Person senden.
4. Die Person öffnet den Link, legt ihr Passwort fest und ist sofort eingerichtet (Team, Vorgesetzter, Ausbilder, Pflichtschulungen). Du erhältst eine Benachrichtigung.
5. Offene Einladungen können unter „Einladungen“ widerrufen werden. Abgelaufene Einladungen einfach neu erstellen.

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
