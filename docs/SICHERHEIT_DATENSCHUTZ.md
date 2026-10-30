# Sicherheit & Datenschutz

> Dieses Dokument beschreibt die technische Umsetzung. Es ist **keine rechtliche Prüfung**. Eine DSGVO-Konformität kann erst nach Prüfung durch eine fachkundige Person bestätigt werden.

## Umgesetzte Maßnahmen

| Bereich | Maßnahme |
|---|---|
| Zugriffskontrolle | Row Level Security auf **allen** Tabellen; Clients nur Lesezugriff; alle Schreibvorgänge über geprüfte Datenbankfunktionen; zusätzlich serverseitige Prüfung jeder Seite/Aktion |
| Rechteausweitung | Rollen/Rechte nur mit `roles.assign` (Admin); keine Selbständerung; letzter Admin geschützt; `bootstrap_admin` nur im SQL-Editor und nur ohne aktiven Admin |
| Konten | keine offene Registrierung; Einladungen mit 256-Bit-Token, nur Hash gespeichert, ablaufend (1 h – 14 Tage), einmalig; Deaktivierung sperrt sofort Daten (DB) und Anmeldung (Auth) |
| Passwörter | min. 10 Zeichen, Buchstaben + Ziffern; Speicherung ausschließlich bei Supabase Auth (bcrypt); Login-Ratenbegrenzung (20 Versuche / 15 Min. / IP) zusätzlich zu Supabase-Limits |
| Sitzung | HttpOnly-Cookies, Token-Prüfung bei jeder Anfrage (Proxy + Server), automatische Erneuerung |
| Dateien | private Buckets, Storage-RLS, Abruf nur über serverseitig geprüfte, 60 Sekunden (Dokumente) bzw. wenige Stunden (Videos) gültige signierte Links; keine erratbaren öffentlichen URLs |
| Abrechnungen | eigener privater Bucket `statements` (nur PDF); Mitarbeitende sehen nur eigene, veröffentlichte Dokumente (RLS in Tabelle **und** Storage); Entwürfe nur für `statements.manage`; Abrechnungsdaten (Anschrift, Steuer, IBAN) getrennt in `employee_billing`, nur für die Person selbst und die Abrechnung; fortlaufende Nummern serverseitig; Storno statt Löschen veröffentlichter Dokumente |
| Provisionen | Sätze nur für `commissions.manage`/`statements.manage`; Mitarbeitende sehen ausschließlich die eigene Stufe |
| Mitarbeiter-Unterlagen | privater Speicher `employee-docs` (PDF/Fotos, max. 15 MB); Lesen nur durch die Person selbst und `employee_docs.manage` (Agenturleitung/Admin), auch auf Speicherebene; Abruf nur über 60 Sekunden gültige Links; Prüfung/Ablehnung im Audit-Log |
| Terminbuchung | öffentliche Buchung nur über den Server (Funktionen für Browser gesperrt), Ratenbegrenzung, Honeypot, Einwilligung; Doppelbuchung durch Datenbank-Ausschlussregel unmöglich; Absage-Link mit zufälligem Token (nur Hash gespeichert); Erinnerungs-Endpunkt nur mit geheimem Schlüssel |
| E-Mail-Zugangsdaten | Microsoft-Graph-Clientschlüssel, SMTP-Passwort bzw. Resend-Schlüssel nur als Vercel-Umgebungsvariable (serverseitig), nie im Browser oder Repository |
| Eingaben | Zod-Validierung in allen Server Actions/APIs; Datenbank-Constraints; Markdown-Renderer ohne HTML |
| Web-Sicherheit | Content-Security-Policy, X-Frame-Options DENY, nosniff, HSTS, Referrer-Policy; Server Actions mit Same-Origin-Prüfung (CSRF-Schutz durch Next.js); keine Open Redirects |
| Fehlerbehandlung | Nutzer sehen verständliche Meldungen; technische Details nur im Server-Log |
| Exporte | nur mit `reports.export`, nur im eigenen Sichtbereich, max. 20.000 Zeilen, jeder Export im Audit-Log; CSV-Formel-Injection neutralisiert |
| Protokollierung | unveränderliches Audit-Log für Profile, Rechte, Teams, Zuordnungen, Leistungen, Produktfreigaben, Provisionen, Abrechnungsdaten, Abrechnungen, Ziele, Kurse, Dokumente, Einladungen, Einstellungen, Bewerber, Exporte (Token-Hashes werden nie protokolliert) |
| Öffentliche API | nur Bewerbungen; Origin-Allowlist, Honeypot, Ratenbegrenzung, Größenlimit, Einwilligung Pflicht |
| Datenminimierung | nur notwendige Felder; Rankings zeigen Vorname + Initial; Bewerberdaten getrennt und löschbar |

## Geprüfte Angriffsszenarien (automatisierte Tests)

`tests/db/*.test.ts` (68 Tests gegen eine echte Postgres-/Supabase-Instanz) und `tests/e2e/*.spec.ts` prüfen u. a.:

1. Vertriebspartner sieht nur eigene Profile/Leistungen/Lernstände (+ Namen der eigenen Führungskräfte).
2. Ausbilder sieht nur zugewiesene Personen; Ende der Zuordnung entzieht Zugriff sofort.
3. Teamleiter sieht nur eigenes Team; Unterteams nur bei ausdrücklicher Freigabe; keine Freigaben in fremden Teams.
4. Agenturleiter sieht agenturweit, aber kein Audit-Log und keine Rechtevergabe.
5. Direkte `UPDATE`/`INSERT`-Versuche auf Profile, Rollen, Rechte → „permission denied“; RPCs verweigern; `bootstrap_admin` gesperrt.
6. Teamwechsel: neuer Teamleiter sieht die Person, alter nicht mehr; Historie bleibt.
7. Storno/Korrektur: keine Zählung, keine Doppelzählung, Begründungspflicht.
8. Doppelte Vorgangs-IDs abgelehnt; Duplikatverdacht nur mit Bestätigung.
9. Private Dokumente: weder Datensatz noch Datei ohne Freigabe abrufbar (auch per direkter Storage-Abfrage).
10. Nicht angemeldet: kein Tabellen-/RPC-Zugriff, Seiten leiten auf Login, APIs liefern 401.
11. Deaktivierte Konten: trotz gültigem Token keine Daten; Anmeldung gesperrt.
12. Quiz-Lösungen sind für Lernende nicht abrufbar; Lektionen nicht durch Öffnen abgeschlossen.
13. Einladungen: einmalig, ablaufend, widerrufbar; höhere Rollen nur mit Admin-Recht.

## Organisatorische To-dos vor dem Echtbetrieb

* [ ] Auftragsverarbeitungsverträge mit Supabase und Vercel (und ggf. Resend) abschließen.
* [ ] EU-Region (Frankfurt) für Supabase und Vercel-Functions wählen.
* [ ] Datenschutzhinweise (`/datenschutz`) und Impressum (`/impressum`) rechtlich prüfen und vervollständigen.
* [ ] Verzeichnis von Verarbeitungstätigkeiten ergänzen (Mitarbeiterportal, Bewerbermanagement).
* [ ] Mitarbeitende über Leistungs-Tracking und Rankings informieren (ggf. Betriebsrat/Vertragsgrundlage prüfen).
* [ ] Löschfristen festlegen: Bewerber (empfohlen ≤ 6 Monate, Funktion `public.purge_applicants(180)`), ausgeschiedene Mitarbeiter (Deaktivierung → nach Fristablauf „Daten löschen (DSGVO)“ im Profil).
* [ ] Admin-Konten mit starken Passwörtern; Supabase-Dashboard mit 2-Faktor-Anmeldung schützen; GitHub- und Vercel-Konto ebenfalls mit 2FA.

## Löschkonzept

| Daten | Vorgehen |
|---|---|
| Ausgeschiedene Mitarbeiter | Konto deaktivieren (sofortige Sperre). Nach Ablauf der Aufbewahrungsfrist im Profil „Daten löschen (DSGVO)“: Name, E-Mail, Telefon, Bild werden entfernt; Leistungsdaten bleiben anonym für Statistiken. |
| Bewerber | im Bereich „Bewerber“ einzeln löschen oder per SQL `select public.purge_applicants(180);` (löscht Bewerbungen ohne Änderung seit 180 Tagen). |
| Benachrichtigungen | können bei Bedarf per SQL nach Alter gelöscht werden. |
| Audit-Log | bewusst unveränderlich; Aufbewahrungsdauer festlegen (z. B. 3 Jahre) und dann per Datenbankadministrator bereinigen. |

## Bekannte Grenzen

* Video-Fortschritt wird vom Browser gemeldet (Plausibilitätsprüfung serverseitig). Für Nachweise Quiz verwenden.
* Signierte Download-Links sind für ihre kurze Laufzeit von jedem nutzbar, der sie besitzt.
* Kein Virenscan hochgeladener Dateien (Uploads nur durch berechtigte Verwaltung).
* Keine Zwei-Faktor-Anmeldung für Mitarbeitende im Portal umgesetzt (Supabase unterstützt TOTP-MFA – mögliche Erweiterung, insbesondere für Admins empfohlen).
