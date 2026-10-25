# ERLEN – Website & Mitarbeiterportal der ERLEN Vertriebsagentur

Öffentliche Website (Startseite mit Bewerbungsformular) und internes CRM-/Mitarbeiterportal in einer Anwendung unter `www.erlen-sales.de`. Das Portal: Mitarbeiterprofile, Rollen & Rechte, Teams, Leistungs-Tracking mit Freigabeprozess, Ziele & Rankings, die Schulungsplattform **ERLEN Academy**, geschützte Dokumente, Einladungen/Onboarding, Benachrichtigungen, Berichte und eine Bewerberschnittstelle für die Website.

**Aktueller Stand und offene Punkte:** siehe [`PROJECT_STATUS.md`](PROJECT_STATUS.md).

## Dokumentation

| Dokument | Inhalt |
|---|---|
| [`docs/EINRICHTUNG_PRODUKTION.md`](docs/EINRICHTUNG_PRODUKTION.md) | Schritt-für-Schritt: Supabase, Vercel, Domain, erster Admin, Backups, Smoke-Test |
| [`docs/BEDIENUNG.md`](docs/BEDIENUNG.md) | Mitarbeiter einladen, Rollen vergeben, Teams, Kennzahlen, Academy, Dokumente |
| [`docs/KENNZAHLEN.md`](docs/KENNZAHLEN.md) | Welche Leistung wann zählt (Status, Storno, Korrektur, Duplikate) |
| [`docs/SICHERHEIT_DATENSCHUTZ.md`](docs/SICHERHEIT_DATENSCHUTZ.md) | Sicherheitskonzept, getestete Szenarien, DSGVO-To-dos, Löschkonzept |
| [`docs/WEBSITE_INTEGRATION.md`](docs/WEBSITE_INTEGRATION.md) | Öffentliche Website: Aufbau, Inhalte anpassen, SEO, Schutz des Portals |
| [`public/demo/index.html`](public/demo/index.html) – online unter `/demo` | Klickbare Offline-Vorschau von Website und Portal (Beispieldaten) |
| [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md) | Bestandsaufnahme, Technik, Datenmodell, Berechtigungsmatrix, Kosten, Risiken |

## Für Nicht-Entwickler: Was brauche ich?

* Ein **Supabase**-Konto (Datenbank & Login) und ein **Vercel**-Konto (Hosting). Kosten für den Echtbetrieb: ca. 25 USD (Supabase Pro) + ca. 20 USD (Vercel Pro) pro Monat (bitte aktuelle Preise prüfen).
* Zugriff auf die DNS-Einstellungen der Domain `erlen-sales.de`.
* Die komplette Anleitung mit Klickpfaden: [`docs/EINRICHTUNG_PRODUKTION.md`](docs/EINRICHTUNG_PRODUKTION.md).

## Lokale Entwicklung (für Entwickler)

Voraussetzungen: Node.js 22, Docker.

```bash
npm install
cp .env.example .env.local        # Werte für lokal: siehe unten
npm run db:start                  # startet Supabase lokal (Docker)
npm run db:reset                  # spielt alle Migrationen ein
npm run seed:dev                  # NUR LOKAL: Beispieldaten & Testkonten
npm run dev                       # http://localhost:3000
```

`npm run db:start` gibt die lokalen Schlüssel aus. In `.env.local` eintragen:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY aus db:start>
SUPABASE_SECRET_KEY=<SECRET_KEY aus db:start>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
RATE_LIMIT_SALT=lokale-entwicklung-salt-123456
APPLICATION_ALLOWED_ORIGINS=http://localhost:8080
```

Testkonten nach `seed:dev` (Passwort `Erlen-Dev-2026`): `admin@erlen.local`, `leitung@erlen.local`, `teamleiter.nord@erlen.local`, `teamleiter.sued@erlen.local`, `ausbilder@erlen.local`, `partner1@erlen.local` … `partner5@erlen.local`. Diese Daten existieren nur in der lokalen Datenbank.

### Befehle

| Befehl | Zweck |
|---|---|
| `npm run typecheck` | TypeScript prüfen |
| `npm run lint` | ESLint |
| `npm test` | Unit-Tests (Kennzahlen, Datumslogik, Sicherheitsfunktionen) |
| `npm run test:db` | Datenbank-/RLS-/Autorisierungstests gegen lokale Supabase (verändern keine Daten) |
| `npm run build && npm run test:e2e` | End-to-End-Tests im Browser (benötigt `seed:dev`) |
| `npm run db:types` | TypeScript-Typen aus dem Datenbankschema erzeugen |

### Projektstruktur

```
supabase/migrations/   Datenbankschema, RLS-Richtlinien, Geschäftslogik (RPC), Stammdaten
src/proxy.ts           Sitzungsprüfung & Login-Umleitung
src/lib/               Auth (DAL), Supabase-Clients, Validierung, Kennzahlen, Datum
src/app/(website)/     Öffentliche Website: Startseite, Bewerbung, Impressum, Datenschutz
src/app/(auth)/        Login, Passwort, Einladung annehmen
src/app/(portal)/      Dashboard, Leistungen, Ziele, Academy, Dokumente, Mitarbeiter, Teams, Berichte, Verwaltung
src/app/api/           Export, Dokument-Download, öffentliche Bewerbungs-API
tests/                 unit/, db/ (Postgres), e2e/ (Playwright)
scripts/seed-dev.mjs   Beispieldaten (nur lokal)
```
