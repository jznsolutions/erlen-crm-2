# Anbindung der ERLEN-Website

Die Website (`Erlen-Page-2.0`, statisches HTML) wurde **nicht verändert**. Empfohlene Struktur:

| Bereich | Adresse |
|---|---|
| Öffentliche Website & Bewerbungsseite | `https://erlen.de` |
| Interner Login / Mitarbeiterportal / Admin / Academy | `https://portal.erlen.de` |

## 1. Login-Link auf der Website

Einen dezenten Link (z. B. im Footer) ergänzen:

```html
<a href="https://portal.erlen.de/login" rel="nofollow">Mitarbeiter-Login</a>
```

Es werden **keine Passwörter oder Sitzungen** zwischen Website und Portal ausgetauscht – die Anmeldung findet ausschließlich auf `portal.erlen.de` statt.

## 2. Bewerbungsformular an das Portal anbinden

Derzeit leitet das Formular nur zu Calendly weiter und speichert keine Daten. Das Portal stellt einen gesicherten Endpunkt bereit:

`POST https://portal.erlen.de/api/public/bewerbung` (JSON)

| Feld | Pflicht | Beschreibung |
|---|---|---|
| `full_name` | ja | Vor- und Nachname |
| `email` | ja | E-Mail |
| `phone` | ja | Telefonnummer |
| `consent` | ja | `true` – Einwilligung in die Datenverarbeitung (Checkbox!) |
| `message` | nein | Freitext |
| `source` | nein | z. B. `website` |
| `website` | – | Honeypot-Feld, muss leer bleiben (Spam-Schutz) |

Schutzmaßnahmen: nur Anfragen von den in `APPLICATION_ALLOWED_ORIGINS` eingetragenen Adressen, max. 5 Bewerbungen pro Stunde und IP, Größenlimit, keine Rückgabe von Daten.

### Beispiel (ersetzt `submitForm` in `index.html`)

```html
<form id="bewerbung" onsubmit="submitForm(event)">
  <input name="full_name" placeholder="Vollständiger Name" required>
  <input name="phone" placeholder="Telefonnummer" required>
  <input name="email" type="email" placeholder="Email Adresse" required>
  <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
  <label style="font-size:13px;opacity:.8"><input type="checkbox" name="consent" required>
    Ich willige ein, dass meine Angaben zur Bearbeitung meiner Bewerbung gespeichert werden (<a href="/datenschutz">Datenschutz</a>).</label>
  <button class="btn">Termin sichern</button>
</form>
<script>
async function submitForm(e){
  e.preventDefault();
  const f = new FormData(e.target);
  const res = await fetch("https://portal.erlen.de/api/public/bewerbung", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      full_name: f.get("full_name"), phone: f.get("phone"), email: f.get("email"),
      consent: f.get("consent") === "on", website: f.get("website"), source: "website"
    })
  });
  if (res.ok) { window.location.href = "https://calendly.com/DEIN-LINK"; }
  else { const d = await res.json().catch(() => ({})); alert(d.error || "Bitte später erneut versuchen."); }
}
</script>
```

> Die Website braucht dann ebenfalls eine Datenschutzerklärung, die diese Verarbeitung beschreibt.

## 3. Vom Bewerber zum Mitarbeiter

Portal → **Bewerber** → Status pflegen → **Einladen** → Einladungsformular ist vorausgefüllt → Einladungslink wird erzeugt (und per E-Mail versendet, falls Resend eingerichtet ist). Mit Annahme der Einladung ist die Person mit Rolle, Team, Vorgesetztem, Ausbilder und Pflichtschulungen eingerichtet.

## 4. Gemeinsames Design

Das Portal nutzt Logo, Hintergrundbild und Farben der Website (`#0B0F1A`, `#1E2A47`). Optional kann die Website später ebenfalls auf Next.js migriert und mit dem Portal in einem Repository zusammengeführt werden – das ist für die Sicherheit **nicht** erforderlich.
