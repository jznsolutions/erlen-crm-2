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

**Variante 0 (am einfachsten, wenn Supabase über die Vercel-Integration verknüpft ist):**
Seite `https://DEINE-ADRESSE/einrichtung` öffnen → „Datenbank jetzt einrichten“ → danach direkt dein Administrator-Konto anlegen (innerhalb von 60 Minuten). Die Seite funktioniert nur bei leerer Datenbank bzw. solange es keinen Administrator gibt. Schritt 6 entfällt dann.

**Variante SQL-Datei:** Inhalt von `supabase/SETUP_PRODUKTION.sql` im Supabase-SQL-Editor einfügen und ausführen (enthält alle Migrationen, nur einmal ausführen).

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
3. **URL Configuration**: *Site URL* = `https://www.erlen-sales.de`; *Redirect URLs*: `https://www.erlen-sales.de/auth/callback`.
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
| `NEXT_PUBLIC_SITE_URL` | `https://www.erlen-sales.de` |
| `SUPABASE_SECRET_KEY` | Secret key (**nur hier, nirgendwo sonst**) |
| `RATE_LIMIT_SALT` | beliebige lange Zufallszeichenkette (mind. 16 Zeichen) |
| `APPLICATION_ALLOWED_ORIGINS` | leer lassen (nur nötig, falls ein externes Formular Bewerbungen schickt) |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` **oder** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | E-Mail-Versand, siehe Abschnitt „E-Mail-Versand“ |
| `EMAIL_FROM` | Absender, z. B. `ERLEN <kontakt@erlen-sales.de>` |

4. **Deploy** klicken. Danach unter **Settings → Functions → Region** möglichst **Frankfurt (fra1)** wählen und erneut deployen.
5. Auftragsverarbeitungsvertrag (DPA) mit Vercel abschließen.

## Schritt 5 – Domain `www.erlen-sales.de` (Website + Portal)

1. Vercel → Projekt → **Settings → Domains** → `www.erlen-sales.de` **und** `erlen-sales.de` hinzufügen (Vercel bietet an, die Variante ohne „www“ automatisch weiterzuleiten – annehmen).
2. Beim Domain-Anbieter die DNS-Einträge genau so setzen, wie Vercel sie anzeigt (typisch: `A`-Eintrag für `@` und `CNAME` für `www`). Dadurch zeigt die Domain nicht mehr auf die alte Website.
3. Warten, bis Vercel „Valid Configuration“ anzeigt (SSL wird automatisch erstellt).
4. Startseite aufrufen → neue Website; `www.erlen-sales.de/login` → Mitarbeiter-Login.

## Schritt 6 – Ersten Administrator anlegen

1. Supabase → **Authentication → Users → Add user → Create new user**: deine geschäftliche E-Mail und ein sicheres Passwort, **Auto Confirm User** aktivieren.
2. Supabase → **SQL Editor** → ausführen (E-Mail anpassen):
   ```sql
   select public.bootstrap_admin('deine@erlen-sales.de');
   ```
   Das funktioniert nur, solange es noch keinen aktiven Administrator gibt.
3. Unter `https://www.erlen-sales.de` anmelden. Weitere Mitarbeiter lädst du ab jetzt im Portal ein (siehe `BEDIENUNG.md`).

## Schritt 7 – Grundkonfiguration im Portal

1. **Verwaltung → Produkte**: Glasfaser, PV-Leads, Strom, Gas … anlegen (Vorgangs-ID wo möglich als Pflicht).
2. **Teams** anlegen.
3. **Verwaltung → Einstellungen**: Freigabepflicht und Ranking-Sichtbarkeit festlegen.
4. **Verwaltung → Dokumente verwalten**: Kategorien anlegen.
5. **Academy verwalten**: Pflichtkurse anlegen und für die Rolle „Vertriebspartner“ als Pflicht freigeben.
6. Mitarbeiter einladen.

## Schritt 8 – Smoke-Test nach jedem Deployment (5 Minuten)

1. `https://www.erlen-sales.de` öffnen → neue Website; Testbewerbung absenden → erscheint im Portal unter „Bewerber“. ✔
1. `https://www.erlen-sales.de/dashboard` im privaten Fenster öffnen → Umleitung auf Login. ✔
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

Neue Code-Version → GitHub `main` → Vercel deployt automatisch.

Bringt ein Update Erweiterungen der Datenbank mit (neue Dateien in `supabase/migrations`), zeigt das Dashboard Administratoren den Hinweis **„Datenbank-Update verfügbar“**:

1. Als Administrator anmelden.
2. `https://www.erlen-sales.de/einrichtung` öffnen (oder im Hinweis auf den Link klicken).
3. **„Update jetzt einspielen“** klicken und ca. 1 Minute warten. Bestehende Daten bleiben erhalten; schlägt etwas fehl, wird nichts verändert.

Alternativ (technisch): `npx supabase db push`.

## E-Mail-Versand (Outlook / Microsoft 365)

> Ausführliche Klick-für-Klick-Anleitung für Einsteiger: `docs/ANLEITUNG_OUTLOOK_EMAIL.md`. Im Portal unter **Einstellungen → E-Mail-Versand** kann eine Test-E-Mail verschickt werden.

Das Portal verschickt Einladungen, Terminbestätigungen, Terminerinnerungen und Hinweise auf neue Gutschriften. Euer Postfach `kontakt@erlen-sales.de` liegt bei Outlook (Microsoft 365). Es gibt zwei Wege – **Weg A ist zu empfehlen**, weil Microsoft die Anmeldung per Passwort (SMTP) ab Dezember 2026 standardmäßig abschaltet.

**Weg A – Microsoft Graph (ohne Postfach-Passwort, zukunftssicher)**

1. Mit dem Microsoft-365-Administratorkonto <https://entra.microsoft.com> öffnen → **Anwendungen → App-Registrierungen → Neue Registrierung**. Name: `ERLEN Portal`, „Nur Konten in diesem Organisationsverzeichnis“ → **Registrieren**.
2. Auf der Übersichtsseite **Anwendungs-ID (Client)** und **Verzeichnis-ID (Mandant)** notieren.
3. **API-Berechtigungen → Berechtigung hinzufügen → Microsoft Graph → Anwendungsberechtigungen → `Mail.Send`** → hinzufügen → **„Administratorzustimmung erteilen“** klicken.
4. **Zertifikate & Geheimnisse → Neuer geheimer Clientschlüssel** (Gültigkeit z. B. 24 Monate) → den angezeigten **Wert** sofort kopieren.
5. Vercel → **Settings → Environment Variables**:
   * `MS_TENANT_ID` = Verzeichnis-ID
   * `MS_CLIENT_ID` = Anwendungs-ID
   * `MS_CLIENT_SECRET` = geheimer Clientschlüssel (**nur in Vercel eintragen**)
   * `EMAIL_FROM` = `ERLEN <kontakt@erlen-sales.de>`
6. **Deployments → … → Redeploy**. Vor Ablauf des Clientschlüssels einen neuen anlegen und in Vercel ersetzen.

**Weg B – SMTP mit Postfach-Passwort (übergangsweise)**

1. Microsoft-365-Admin-Center → **Benutzer → aktive Benutzer → kontakt@… → E-Mail → E-Mail-Apps verwalten → „Authentifiziertes SMTP“ aktivieren**.
2. In Vercel eintragen: `SMTP_HOST` = `smtp.office365.com`, `SMTP_PORT` = `587`, `SMTP_USER` = `kontakt@erlen-sales.de`, `SMTP_PASS` = Passwort des Postfachs (bei aktivierter Zwei-Faktor-Anmeldung ein App-Kennwort), `EMAIL_FROM` = `ERLEN <kontakt@erlen-sales.de>` → **Redeploy**.

**Test:** Verwaltung → Benutzer & Einladungen → dich selbst mit einer privaten Adresse einladen. Der gelbe Hinweis „E-Mail-Versand noch nicht eingerichtet“ verschwindet, sobald die Werte gesetzt sind.

Für „Passwort vergessen“ zusätzlich in **Supabase → Authentication → Emails → SMTP Settings** SMTP-Daten eintragen (Supabase unterstützt nur SMTP).

## Terminbuchung für Bewerber

Bewerber wählen auf der Website (Bereich „Termin“ und nach dem Absenden der Bewerbung) einen freien Termin. Ein Zeitpunkt kann nur einmal gebucht werden – das stellt die Datenbank sicher, auch wenn zwei Personen gleichzeitig buchen. Bewerber und ihr (Adresse unter **Termine → Einstellungen**) erhaltet eine Bestätigung mit Kalendereintrag, 2 Stunden vorher eine Erinnerung. Bewerber können über den Link in der Mail absagen.

1. Portal → **Termine** → „Wann seid ihr erreichbar?“ Wochentage und Uhrzeiten festlegen, Dauer je Termin und Vorlaufzeit einstellen.
2. **Einmalig:** auf der Seite **Termine** „Automatische Erinnerungen aktivieren“ klicken (nur Administrator). Das richtet in Supabase einen Zeitplaner ein, der alle 5 Minuten fällige Erinnerungen verschickt. Nach einem Domainwechsel erneut klicken („Erinnerungen neu einrichten“).
3. Urlaub/Feiertage unter „Zeiten sperren“ eintragen.

