# E-Mail-Versand über Outlook einrichten (Schritt für Schritt)

Danach verschickt das Portal **automatisch** von `kontakt@erlen-sales.de`:

* die **Einladung zum Bewerbungsgespräch** an jeden, der sich auf der Website bewirbt (mit Button „Termin auswählen“), plus eine Info-Mail an euch,
* Terminbestätigungen und Erinnerungen (2 Stunden vorher),
* Einladungen neuer Mitarbeiter ins Portal,
* Hinweise auf neue Gutschriften.

Dauer: ca. 15 Minuten. Du brauchst zwei Browser-Tabs: **Microsoft** und **Vercel**.

> Wichtig: Passwörter und geheime Schlüssel nur bei Microsoft und Vercel eintippen – nie in einen Chat, eine E-Mail oder eine Datei.

---

## Teil 1 – Bei Microsoft eine „App“ für das Portal anlegen

Das ist eine Art Ausweis, mit dem das Portal E-Mails über euer Outlook senden darf – ohne euer Postfach-Passwort.

**Schritt 1.** Öffne <https://entra.microsoft.com> und melde dich mit dem **Microsoft-365-Administrator-Konto** an (das Konto, mit dem ihr eure Microsoft-Lizenzen verwaltet – oft `kontakt@erlen-sales.de` selbst).

**Schritt 2.** Links im Menü: **Identität** → **Anwendungen** → **App-Registrierungen**. (Siehst du „Identität“ nicht, klicke links oben auf die drei Striche ☰.)

**Schritt 3.** Oben auf **+ Neue Registrierung** klicken.

**Schritt 4.** Ausfüllen:
* **Name:** `ERLEN Portal`
* **Unterstützte Kontotypen:** die **erste** Option („Nur Konten in diesem Organisationsverzeichnis“)
* **Umleitungs-URI:** leer lassen

Unten auf **Registrieren** klicken.

**Schritt 5.** Du siehst jetzt die Übersicht der App. Dort stehen zwei lange Nummern. Kopiere sie nacheinander in einen Notizzettel (z. B. die Notizen-App auf deinem Handy, nur vorübergehend):
* **Anwendungs-ID (Client)** → das wird später `MS_CLIENT_ID`
* **Verzeichnis-ID (Mandant)** → das wird später `MS_TENANT_ID`

**Schritt 6.** Links auf **API-Berechtigungen** klicken → **+ Berechtigung hinzufügen** → großes Feld **Microsoft Graph** → **Anwendungsberechtigungen** (rechte Kachel, *nicht* „Delegiert“).

**Schritt 7.** Ins Suchfeld `Mail.Send` tippen → Haken bei **Mail.Send** setzen → unten **Berechtigungen hinzufügen**.

**Schritt 8.** Zurück in der Liste: auf **Administratorzustimmung für … erteilen** klicken → **Ja**. In der Spalte „Status“ steht danach ein grüner Haken „Gewährt“.

**Schritt 9.** Links auf **Zertifikate & Geheimnisse** → Reiter **Geheime Clientschlüssel** → **+ Neuer geheimer Clientschlüssel**.
* **Beschreibung:** `Vercel`
* **Gültig bis:** 24 Monate
* **Hinzufügen** klicken.

**Schritt 10.** Jetzt erscheint eine Zeile mit **Wert** und **Geheime ID**. Kopiere sofort den **Wert** (Symbol mit den zwei Blättern daneben) – er wird nur dieses eine Mal angezeigt. Das wird `MS_CLIENT_SECRET`.
⚠️ Nicht die „Geheime ID“ kopieren – das ist der häufigste Fehler.

Microsoft ist fertig. Den Tab kannst du offen lassen.

---

## Teil 2 – Die Werte bei Vercel eintragen

**Schritt 11.** Öffne <https://vercel.com>, melde dich an und klicke auf euer Projekt (die Website).

**Schritt 12.** Oben auf **Settings** → links auf **Environment Variables**.

**Schritt 13.** Trage nacheinander diese vier Einträge ein. Für jeden: links bei **Key** den Namen, rechts bei **Value** den Wert, die Häkchen bei Production/Preview/Development so lassen, dann **Save**.

| Key | Value |
|---|---|
| `MS_TENANT_ID` | Verzeichnis-ID aus Schritt 5 |
| `MS_CLIENT_ID` | Anwendungs-ID aus Schritt 5 |
| `MS_CLIENT_SECRET` | Wert aus Schritt 10 |
| `EMAIL_FROM` | `ERLEN <kontakt@erlen-sales.de>` |

**Schritt 14.** Oben auf **Deployments** → beim obersten Eintrag rechts auf die drei Punkte **⋯** → **Redeploy** → nochmal **Redeploy** bestätigen. Warte ca. 1–2 Minuten, bis „Ready“ erscheint.

**Schritt 15.** Lösche die Werte von deinem Notizzettel.

---

## Teil 3 – Testen

**Schritt 16.** Öffne `https://www.erlen-sales.de/login` und melde dich als Administrator an.

**Schritt 17.** Links ganz unten auf **Einstellungen** → Kasten **E-Mail-Versand**. Dort sollte „Versandweg: Microsoft 365 / Outlook“ stehen.

**Schritt 18.** Auf **Test-E-Mail an … senden** klicken.
* **„Hat geklappt!“** → Schau in dein Postfach (auch im Spam-Ordner). Fertig! 🎉
* **Rote Meldung** → Dort steht genau, was nicht stimmt (z. B. „Es muss der Wert kopiert werden, nicht die Geheime ID“). Korrigiere den Wert in Vercel (Schritt 12–14) und teste erneut.

**Schritt 19.** Echter Test: Öffne die Website in einem privaten Browserfenster, bewirb dich mit einer privaten E-Mail-Adresse. Du solltest „Deine Einladung zum Bewerbungsgespräch bei ERLEN“ erhalten, und `kontakt@erlen-sales.de` bekommt „Neue Bewerbung: …“.

**Schritt 20.** Damit die Erinnerungen 2 Stunden vor Terminen kommen: Portal → **Termine** → **Automatische Erinnerungen aktivieren** (einmalig).

---

## Häufige Fragen

* **Ich finde „App-Registrierungen“ nicht / habe keine Rechte.** Dann ist dein Konto kein Administrator. Melde dich mit dem Konto an, mit dem ihr Microsoft 365 gekauft habt, oder frage die Person, die eure Microsoft-Lizenzen verwaltet.
* **Der Schlüssel läuft nach 24 Monaten ab.** Microsoft schickt vorher eine Warnung. Dann Schritt 9–10 wiederholen und in Vercel `MS_CLIENT_SECRET` ersetzen (Schritt 12–14).
* **Geht es auch mit dem Postfach-Passwort?** Übergangsweise ja (SMTP, siehe `docs/EINRICHTUNG_PRODUKTION.md`), aber Microsoft schaltet das ab Dezember 2026 standardmäßig ab. Der Weg oben funktioniert dauerhaft.
* **Für Fortgeschrittene:** Die Berechtigung „Mail.Send“ erlaubt technisch das Senden für alle Postfächer eurer Organisation. Wer das auf `kontakt@erlen-sales.de` begrenzen möchte, richtet in Exchange Online eine „Application Access Policy“ bzw. „RBAC for Applications“ ein.
