# Einrichtung der Produktionsumgebung (Schritt für Schritt)

> Die Menüs von Supabase und Vercel ändern sich gelegentlich. Wenn ein Menüpunkt anders heißt, suche nach dem fett gedruckten Begriff.
> **Gib Passwörter oder geheime Schlüssel niemals in einen Chat ein.** Trage sie nur direkt bei Supabase/Vercel ein.

## Benötigte Konten

1. **GitHub** (vorhanden) – enthält den Code (`jznsolutions/erlen-crm-2`).
2. **Supabase** – https://supabase.com (Datenbank, Login, Dateien). Für den Echtbetrieb den **Pro-Tarif** wählen (Backups!).
3. **Vercel** – https://vercel.com (Hosting). Für gewerbliche Nutzung **Pro-Tarif**.
4. Optional **Resend** – https://resend.com (Einladungs-E-Mails).
5. Zugang zur **DNS-Verwaltung** deiner Domain (z. B. bei IONOS, Strato, Cloudflare).

## Schritt 1 – Supabase-Projekt anlegen

1. Supabase → **New project**.
2. Name: `erlen-crm`, Datenbank-Passwort: lange Zufallszeichenkette erzeugen und in einem Passwort-Manager speichern.
3. **Region: Central EU (Frankfurt)** (wichtig für den Datenschutz).
4. Nach dem Anlegen: **Project Settings → API Keys**. Notiere (im Passwort-Manager):
   * **Project URL** → später `NEXT_PUBLIC_SUPABASE_URL`
   * **Publishable key** (`sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   * **Secret key** (`sb_secret_…`) → `SUPABASE_SECRET_KEY` (**geheim!**)
5. Auftragsverarbeitungsvertrag (DPA) bei Supabase abschließen: **Organization Settings → Legal/Documents**.

## Schritt 2 – Datenbank einrichten (Migrationen)

**Variante A (empfohlen, auf einem Computer mit Node.js):**

```bash
git clone https://github.com/jznsolutions/erlen-crm-2.git
cd erlen-crm-2
npm install
npx supabase login                       # öffnet den Browser
npx supabase link --project-ref DEIN_REF # REF = Teil der Project-URL vor .supabase.co
npx supabase db push                     # spielt alle Migrationen ein
```

**Variante B (ohne Programmierumgebung):** Supabase → **SQL Editor** → **New query**. Öffne nacheinander die Dateien aus `supabase/migrations/` (in der Reihenfolge der Dateinamen 0100 → 0600), kopiere jeweils den gesamten Inhalt hinein und klicke **Run**. Bei einer Fehlermeldung abbrechen und melden.

> Die Datei `scripts/seed-dev.mjs` (Beispieldaten) **niemals** gegen die Produktion ausführen – sie verweigert dies auch selbst.

## Schritt 3 – Login absichern

Supabase → **Authentication**:

1. **Sign In / Providers**: „**Allow new users to sign up**“ **ausschalten** (Konten entstehen nur per Einladung). Provider **Email** bleibt **aktiv**.
2. **Email**-Provider: Mindestlänge Passwort **10**, Anforderung „Buchstaben und Ziffern“.
3. **URL Configuration**: *Site URL* = `https://portal.erlen.de`; *Redirect URLs*: `https://portal.erlen.de/auth/callback`.
4. **Emails → SMTP Settings**: eigenen SMTP-Server eintragen (z. B. von Resend oder deinem E-Mail-Anbieter). Ohne eigenen SMTP verschickt Supabase nur sehr wenige E-Mails („Passwort vergessen“ funktioniert sonst kaum).
5. Optional: **Emails → Templates** → Vorlage „Reset Password“ ins Deutsche übersetzen.

## Schritt 4 – App bei Vercel veröffentlichen

1. Vercel → **Add New → Project** → GitHub-Repository `erlen-crm-2` **importieren**.
2. Framework wird automatisch als Next.js erkannt.
3. **Environment Variables** eintragen (Werte aus Schritt 1, Vorlage: `.env.example`):

| Name | Wert |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key |
| `NEXT_PUBLIC_SITE_URL` | `https://portal.erlen.de` |
| `SUPABASE_SECRET_KEY` | Secret key (**nur hier, nirgendwo sonst**) |
| `RATE_LIMIT_SALT` | beliebige lange Zufallszeichenkette (mind. 16 Zeichen) |
| `APPLICATION_ALLOWED_ORIGINS` | `https://erlen.de,https://www.erlen.de` (Adresse(n) der Website) |
| `RESEND_API_KEY` | optional |
| `EMAIL_FROM` | optional, z. B. `ERLEN Vertriebsagentur <portal@erlen.de>` |

4. **Deploy** klicken. Danach unter **Settings → Functions → Region** möglichst **Frankfurt (fra1)** wählen und erneut deployen.
5. Auftragsverarbeitungsvertrag (DPA) mit Vercel abschließen.

## Schritt 5 – Domain `portal.erlen.de`

1. Vercel → Projekt → **Settings → Domains** → `portal.erlen.de` hinzufügen.
2. Beim Domain-Anbieter einen **CNAME**-Eintrag anlegen: Name `portal`, Ziel wie von Vercel angezeigt (meist `cname.vercel-dns.com`).
3. Warten, bis Vercel „Valid Configuration“ anzeigt (SSL wird automatisch erstellt).

## Schritt 6 – Ersten Administrator anlegen

1. Supabase → **Authentication → Users → Add user → Create new user**: deine geschäftliche E-Mail und ein sicheres Passwort, **Auto Confirm User** aktivieren.
2. Supabase → **SQL Editor** → ausführen (E-Mail anpassen):
   ```sql
   select public.bootstrap_admin('deine@erlen.de');
   ```
   Das funktioniert nur, solange es noch keinen aktiven Administrator gibt.
3. Unter `https://portal.erlen.de` anmelden. Weitere Mitarbeiter lädst du ab jetzt im Portal ein (siehe `BEDIENUNG.md`).

## Schritt 7 – Grundkonfiguration im Portal

1. **Verwaltung → Produkte**: Glasfaser, PV-Leads, Strom, Gas … anlegen (Vorgangs-ID wo möglich als Pflicht).
2. **Teams** anlegen.
3. **Verwaltung → Einstellungen**: Freigabepflicht und Ranking-Sichtbarkeit festlegen.
4. **Verwaltung → Dokumente verwalten**: Kategorien anlegen.
5. **Academy verwalten**: Pflichtkurse anlegen und für die Rolle „Vertriebspartner“ als Pflicht freigeben.
6. Mitarbeiter einladen.

## Schritt 8 – Smoke-Test nach jedem Deployment (5 Minuten)

1. `https://portal.erlen.de/dashboard` im privaten Fenster öffnen → Umleitung auf Login. ✔
2. Als Admin anmelden → Dashboard lädt, keine Fehlermeldung. ✔
3. Testleistung als Vertriebspartner-Testkonto einreichen, als Teamleiter bestätigen → erscheint im Dashboard. ✔
4. Testdokument hochladen, nur für „Teamleiter“ freigeben → mit Vertriebspartner-Konto nicht sichtbar. ✔
5. Einladung erstellen → Link im privaten Fenster öffnen → Konto anlegen → zweiter Aufruf des Links zeigt „ungültig“. ✔
6. Testdaten danach stornieren/löschen bzw. Testkonten deaktivieren.

## Backup & Wiederherstellung

* **Supabase Pro** erstellt **tägliche Backups** (7 Tage Aufbewahrung): **Database → Backups**. Für minutengenaue Wiederherstellung das Add-on **Point in Time Recovery** buchen.
* **Zusätzlich empfohlen (monatlich):** eigene Sicherung mit `npx supabase db dump --linked -f backup-JJJJ-MM.sql` (Struktur) und `npx supabase db dump --linked --data-only -f daten-JJJJ-MM.sql` – verschlüsselt außerhalb von Supabase aufbewahren.
* **Dateien** (Storage) sind nicht in Datenbank-Backups enthalten → wichtige Schulungsvideos/Dokumente zusätzlich lokal aufbewahren.
* **Wiederherstellung:** Supabase → Database → Backups → gewünschten Stand → *Restore* (überschreibt den aktuellen Stand!). Vorher mit der Agenturleitung abstimmen und Mitarbeitende informieren.
* Wiederherstellung **einmal jährlich testen** (z. B. in ein separates Test-Projekt einspielen).

## Updates einspielen

Neue Code-Version → GitHub `main` → Vercel deployt automatisch. Enthält das Update neue Dateien in `supabase/migrations`, **vorher** `npx supabase db push` ausführen.
