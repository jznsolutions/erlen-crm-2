# Architektur & Bestandsaufnahme

## 1. Bestandsaufnahme (Phase 1, Stand 25.10.2026)

| Quelle | Befund | Entscheidung |
|---|---|---|
| `jznsolutions/erlen-crm-2` (dieses Repo) | leer (nur README) | Neuaufbau hier |
| `jznsolutions/erlen-crm` | leer (nur README, früherer Versuch) | nicht verwendet |
| `jznsolutions/Erlen-Page-2.0` (Website) | statische Einzelseite (`index.html`, Logo, Hintergrundbild). Farben `#0B0F1A` / `#1E2A47`. Bewerbungsformular leitet derzeit nur auf Calendly weiter, speichert nichts. | **Nicht verändert.** Logo, Hintergrund und Farben übernommen. Anbindung über definierte Schnittstelle (siehe `WEBSITE_INTEGRATION.md`). |

**Update:** Die Website wurde neu in dieselbe Next.js-Anwendung integriert (Route-Gruppe `src/app/(website)`). Website und Portal laufen unter einer Domain `www.erlen-sales.de`; interne Bereiche sind für Suchmaschinen gesperrt und nur angemeldet erreichbar. Siehe `WEBSITE_INTEGRATION.md`.

## 2. Technischer Stack

| Ebene | Technologie |
|---|---|
| Frontend & Server | Next.js 16 (App Router, Server Components, Server Actions), TypeScript, React 19 |
| UI | Tailwind CSS 4, eigene Komponenten im shadcn/ui-Stil (Radix-Primitives), Lucide-Icons, Recharts |
| Validierung | Zod 4 (Formulare, Server Actions, öffentliche API) |
| Datenbank | PostgreSQL (Supabase) mit Row Level Security |
| Authentifizierung | Supabase Auth (E-Mail + Passwort), Sitzung per HttpOnly-Cookies (`@supabase/ssr`) |
| Dateien | private Supabase-Storage-Buckets `documents`, `academy`, `avatars` |
| Hosting | Vercel (App) + Supabase (DB/Auth/Storage) |
| Tests | Vitest (Unit + DB-Integration gegen echte Postgres-Instanz), Playwright (E2E) |

## 3. Schichten und Sicherheitsprinzip

```
Browser ──► Next.js Proxy (Sitzung prüfen/erneuern, Login-Umleitung)
        ──► Server Components (lesen mit Benutzer-Sitzung → RLS filtert)
        ──► Server Actions (Zod-Validierung → RPC-Funktion in der DB)
                                   │
                    PostgreSQL: RPC prüft Berechtigung + Geschäftsregeln,
                    schreibt Audit-Log, Benachrichtigungen; RLS für alle Lesezugriffe
```

* **Lesen:** Jede Tabelle hat RLS. Clients (Rolle `authenticated`) haben nur `SELECT`-Rechte; die Richtlinien bestimmen, welche Zeilen sichtbar sind. Nicht angemeldete Clients (`anon`) haben auf keine Tabelle Zugriff.
* **Schreiben:** Es gibt **keine** direkten `INSERT/UPDATE/DELETE`-Rechte für Clients. Alle Änderungen laufen über `SECURITY DEFINER`-Funktionen (RPC), die selbst prüfen, ob die angemeldete Person das darf. Selbst wenn jemand die API direkt mit seinem Token aufruft, gelten dieselben Regeln.
* **Hilfsfunktionen** (`has_permission`, `visible_user_ids` …) liegen im Schema `private`, das nicht über die REST-API erreichbar ist.
* **Service-Schlüssel** (`SUPABASE_SECRET_KEY`) wird nur serverseitig genutzt für: Einladungen einlösen, Konten sperren, öffentliche Bewerbungen speichern, Ratenbegrenzung. Jeweils erst nach Prüfung.
* Die Oberfläche blendet Menüpunkte nach Berechtigung aus – das ist **nur Komfort**; der Schutz liegt in Datenbank und Server.

## 4. Rollen, Berechtigungen, Sichtbereiche

Getrennte Konzepte:

| Konzept | Umsetzung |
|---|---|
| Rolle | `profiles.role_id` → `roles` (5 Rollen) |
| Einzelberechtigung | `permissions` + `role_permissions` (Vorlage je Rolle) |
| Individuelle Ausnahme | `user_permissions` mit `grant` (zusätzlich) oder `deny` (einschränken) |
| Teamzuordnung | `team_memberships` (mit Historie, `ended_at`) – Mitglied oder Teamleitung, optional inkl. Unterteams |
| Vorgesetzter / Ausbilder | `reporting_relationships` (mit Historie) |
| Sichtbarkeit | `private.visible_user_ids(betrachter, bereich)` – berechnet aus Berechtigung + aktueller Zuordnung |
| Aktiv/Inaktiv | `profiles.status`; inaktive Konten haben **keine** Berechtigungen und werden zusätzlich im Auth-System gesperrt |

Effektive Berechtigung = (Rolle ∪ individuelle Freigabe) − individuelle Sperre, nur bei aktivem Konto.

Sichtbereiche je Datenbereich (`employees`, `performance`, `training.progress`), jeweils mit `.read.self`, `.read.assigned` (Ausbilder), `.read.team` (geführte Teams + direkt Unterstellte), `.read.all`.

### Berechtigungsmatrix (Standardvorlagen, unter „Rollen & Rechte“ änderbar)

| Berechtigung | Vertriebspartner | Ausbilder | Teamleiter | Agenturleiter | Admin |
|---|:-:|:-:|:-:|:-:|:-:|
| eigenes Profil/Leistung/Lernfortschritt | ✓ | ✓ | ✓ | ✓ | ✓ |
| eigene Leistungen erfassen | ✓ | ✓ | ✓ | ✓ | ✓ |
| Schulungen nutzen, Dokumente lesen, Rankings | ✓ | ✓ | ✓ | ✓ | ✓ |
| Zugewiesene Auszubildende (Profil, Leistung, Lernstand) | – | ✓ | ✓ | (alle) | ✓ |
| Lernfortschritt dokumentieren, Feedback/Notizen | – | ✓ | ✓ | ✓ | ✓ |
| Team (Profil, Leistung, Lernstand), Teamberichte | – | – | ✓ | (alle) | ✓ |
| Leistungen für andere erfassen, bestätigen, stornieren, korrigieren | – | – | ✓ (Team) | ✓ | ✓ |
| Ziele verwalten | – | – | ✓ (Team) | ✓ | ✓ |
| Export (im eigenen Sichtbereich) | – | – | ✓ | ✓ | ✓ |
| Agenturweite Daten & Berichte | – | – | – | ✓ | ✓ |
| Teams/Organisation, Stammdaten bearbeiten | – | – | – | ✓ | ✓ |
| Produkte, Wettbewerbe, Kurse, Dokumente, Mitteilungen | – | – | – | ✓ | ✓ |
| Bewerber | – | – | – | ✓ | ✓ |
| Einladen, Rollen/Rechte vergeben, Konten (de)aktivieren | – | – | – | – | ✓ |
| Systemeinstellungen, Audit-Log | – | – | – | – | ✓ |

Zusätzliche feste Regeln (unabhängig von der Matrix): niemand ändert die eigene Rolle/Rechte oder deaktiviert sich selbst; der letzte aktive Administrator kann nicht entfernt werden; eigene Leistungen kann niemand selbst bestätigen; Einladungen mit höheren Rollen als Vertriebspartner erfordern `roles.assign`.

## 5. Datenmodell (Migrationen in `supabase/migrations`)

| Bereich | Tabellen |
|---|---|
| Kern | `roles`, `permissions`, `role_permissions`, `user_permissions`, `profiles`, `employee_details`, `teams`, `team_memberships`, `reporting_relationships`, `organization_settings`, `audit_logs` |
| Leistung | `products`, `performance_records`, `performance_adjustments`, `performance_approvals`, `targets`, `target_achievements`, `competitions` |
| Academy | `courses`, `course_modules`, `lessons`, `course_access`, `course_assignments`, `lesson_progress`, `quizzes`, `quiz_questions`, `quiz_answers`, `quiz_attempts`, `training_notes` |
| Dokumente | `document_categories`, `documents`, `document_permissions`, `announcements` (+ Storage-Buckets) |
| Onboarding | `invitations`, `notifications`, `applicants`, `private.rate_limits` |

Konventionen: UUID-Primärschlüssel, `timestamptz` (UTC) für Zeitpunkte, `date` für Geschäftstage (Europe/Berlin), Prüf-Constraints für Wertebereiche, Indizes auf Filter-/Join-Spalten, Mitgliedschaften und Zuordnungen werden **beendet statt gelöscht** (Historie), Audit-Trigger auf allen kritischen Tabellen (unveränderlich).

`performance_records.team_id` speichert das Team **zum Zeitpunkt der Erfassung**. Teamauswertungen bleiben dadurch bei Teamwechseln historisch korrekt; die *Sichtbarkeit* richtet sich nach der aktuellen Zuordnung.

## 6. Externe Dienste & Kosten

| Dienst | Zweck | Kosten (Stand Planung, bitte aktuell prüfen) |
|---|---|---|
| Supabase | Datenbank, Login, Dateien | Free-Tarif zum Testen; für Produktion **Pro-Tarif empfohlen** (tägliche Backups, keine Pausierung, größere Dateien) – ca. 25 USD/Monat |
| Vercel | Hosting | Hobby nur privat/nicht-kommerziell; für Firmen **Pro** – ca. 20 USD/Monat je Mitglied |
| Resend (optional) | Einladungs-E-Mails | Free-Tarif reicht meist; eigene Domain mit DNS-Einträgen nötig |
| Domain | `www.erlen-sales.de` | bestehende Domain, DNS-Eintrag beim Domain-Anbieter |

## 7. Risiken

* Datenschutz: personenbezogene Mitarbeiterdaten → AV-Verträge mit Supabase/Vercel, EU-Region wählen, Datenschutzhinweise rechtlich prüfen (Vorlage unter `/datenschutz`).
* Video-Fortschritt wird vom Browser gemeldet; Manipulation ist technisch möglich (abgemildert durch Echtzeit-Plausibilität). Für prüfungsrelevante Inhalte Quiz verwenden.
* Große Videos: Supabase Free erlaubt nur 50 MB pro Datei; für Videos bis 500 MB Pro-Tarif und ggf. höheres Upload-Limit einstellen.
* Supabase-Standard-E-Mail-Versand (Passwort vergessen) ist stark begrenzt → eigenen SMTP-Server in Supabase hinterlegen.
