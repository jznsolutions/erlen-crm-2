# Projektstatus ERLEN CRM

Stand: 25.10.2026 · Branch `feature/crm-fundament`

## Phasen

| Phase | Status | Ergebnis |
|---|---|---|
| 1 Bestandsaufnahme & Planung | ✅ erledigt | `docs/ARCHITEKTUR.md` (Bestand, Architektur, Datenmodell, Berechtigungsmatrix, Risiken, Dienste) |
| 2 Fundament | ✅ erledigt | Next.js 16 + Supabase, 6 Migrationen, RLS auf allen Tabellen, RBAC mit Ausnahmen, Auth (Login, Passwort-Reset, Einladung), Designsystem, Layout mit Sidebar & mobiler Navigation |
| 3 CRM-Kern | ✅ erledigt | Mitarbeiterprofile (inkl. Historie & Verwaltung), Teams/Unterteams/Historie, Vorgesetzte/Ausbilder, Leistungserfassung mit Freigabe, Storno, Korrektur, Duplikatschutz, 4 rollenabhängige Dashboards |
| 4 Academy & Dokumente | ✅ erledigt | Kurse/Module/Lektionen (Text, Video, PDF, Quiz), Freigaben & Pflichtschulungen, Fortschrittsregeln, Ausbilder-Dokumentation & Feedback, Kursverwaltung, geschützte Dokumente & Mitteilungen |
| 5 Ziele & Auswertungen | ✅ erledigt | Ziele (Person/Team/Agentur, Tag/Woche/Monat/Zeitraum), Bestenlisten (konfigurierbar je Rolle), Wettbewerbe, Berichte mit Filtern, CSV-Export (protokolliert) |
| 6 Integration & Onboarding | ✅ erledigt | Einladungsprozess, Onboarding, Benachrichtigungen, Bewerberverwaltung. **Neue öffentliche Website** in derselben App (Startseite, Bewerbung → Portal, Impressum/Datenschutz-Vorlagen, SEO, Portal für Suchmaschinen gesperrt) |
| 7 Qualitätssicherung | ✅ erledigt (lokal) | Typecheck, Lint, Build grün; 17 Unit-, 68 Datenbank-, 11 E2E-Tests grün; Seiten-Crawl je Rolle ohne Fehler; Mobilansicht (390 px) geprüft |
| 8 Deployment | ⏳ vorbereitet | Anleitung `docs/EINRICHTUNG_PRODUKTION.md`, `.env.example`, CI-Workflow. **Ausführung erfordert deine Konten** (Supabase, Vercel, DNS) |

## Testergebnisse (letzter Lauf, lokal gegen Supabase-Stack in Docker)

* `npm run typecheck` – ok · `npm run lint` – ok · `npm run build` – ok
* `npm test` – 17/17 (Kennzahlen, Datum/Zeitzone, Open-Redirect, CSV-Injection, Validierung)
* `npm run test:db` – 68/68 (alle 10 Pflichtszenarien + Freigabe, Storno, Korrektur, Duplikate, Ziele, Rankings, Academy-Fortschritt, Quiz-Schutz, Einladungen)
* `npm run test:e2e` – 14/14 (Website öffentlich/indexierbar, Portal gesperrt, Bewerbung über Website, Zugriffsschutz, Leistungs-Workflow, Einladung, Bewerber-API, Lektion/Mindestzeit, private Dokumente, Deaktivierung)

## Bekannte Einschränkungen / noch nicht umgesetzt

* **Nicht produktiv geschaltet:** Supabase-Projekt, Vercel-Projekt und Domain müssen von dir angelegt werden (Anleitung vorhanden). CI-Workflow ist angelegt, aber noch nicht auf GitHub gelaufen.
* **Rechtliches:** Datenschutzhinweise/Impressum sind Vorlagen; AV-Verträge, Verarbeitungsverzeichnis und Information der Mitarbeitenden stehen aus. Keine Aussage zur DSGVO-Konformität ohne Prüfung.
* **E-Mail:** Nur Einladungen können per E-Mail versendet werden (optional über Resend). Alle anderen Benachrichtigungen sind In-App. „Passwort vergessen“ benötigt eigenen SMTP in Supabase.
* **Nicht umgesetzt (bewusst als spätere Erweiterung):** Abschlusszertifikate, Leistungsabzeichen/Badges, Zwei-Faktor-Anmeldung im Portal, Dunkelmodus, Bulk-Import von Leistungen (CSV-Upload), automatische Löschjobs (Funktion `purge_applicants` vorhanden, Zeitplan fehlt).
* **Video-Fortschritt** wird vom Browser gemeldet (mit serverseitiger Plausibilitätsprüfung). Große Videos: Free-Tarif max. 50 MB/Datei; resumable Uploads (TUS) nicht umgesetzt.
* **Teamsicht nach Teamwechsel:** Der neue Teamleiter sieht die Person inkl. Historie; der alte nicht mehr. Teamsummen der Vergangenheit basieren auf dem Team zum Erfassungszeitpunkt.
* **Performance:** Dashboards aggregieren Tageswerte (bis 180 Tage) – ausgelegt für Agenturen bis einige hundert Mitarbeitende. Bei deutlich größerem Volumen Aggregation weiter in die Datenbank verlagern.
* Lokale Entwicklungsumgebung: In dieser Cloud-Umgebung musste das PostgREST-Docker-Image aus dem offiziellen Release-Binary gebaut werden (Registry blockiert) – auf normalen Rechnern nicht nötig.

## Nächste konkrete Schritte

1. Branch prüfen und nach `main` übernehmen (Pull Request).
2. Supabase-Projekt (Frankfurt, Pro) anlegen → Migrationen einspielen → Auth-Einstellungen setzen (`docs/EINRICHTUNG_PRODUKTION.md`, Schritte 1–3).
3. Vercel-Projekt anlegen, Umgebungsvariablen eintragen, `portal.erlen.de` verbinden (Schritte 4–5).
4. Ersten Admin per `bootstrap_admin` anlegen, Produkte/Teams/Einstellungen pflegen, Pflichtkurs anlegen (Schritte 6–7).
5. Smoke-Test durchführen (Schritt 8); Pilotphase mit 1 Team.
6. Datenschutz: AV-Verträge, Datenschutzhinweise prüfen lassen, Mitarbeitende informieren.
7. Website: echte Kontaktdaten/WhatsApp/Calendly in `src/lib/site.ts`, Impressum & Datenschutz vervollständigen, Texte (insb. FAQ) prüfen; Domain `erlen-sales.de` auf Vercel umstellen.
7a. Das Vorbild `sales-focus.de` konnte aus der Entwicklungsumgebung nicht geladen werden (Netzwerk gesperrt) – Struktur basiert auf der bisherigen ERLEN-Seite und gängigen Karriereseiten; Feinschliff nach Screenshots des Vorbilds.
8. Optional: SMTP/Resend einrichten, Supabase-Backups/PITR prüfen, Zwei-Faktor-Anmeldung für Admins ergänzen.
