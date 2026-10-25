// Fasst alle Migrationen zu einer Datei zusammen, die im Supabase-SQL-Editor
// mit einmal Kopieren/Einfügen ausgeführt werden kann.  Aufruf: npm run db:setup-sql
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const header = `-- =============================================================================
-- ERLEN – Einrichtung der Produktionsdatenbank (automatisch erzeugt)
-- =============================================================================
-- Anleitung: Supabase → SQL Editor → New query → gesamten Inhalt dieser Datei
-- einfügen → "Run". NUR EINMAL in einer leeren Datenbank ausführen.
-- Enthält: ${files.join(", ")}
-- =============================================================================

begin;
`;
const body = files.map((f) => `\n-- ----- ${f} -----\n` + readFileSync(new URL(f, dir), "utf8")).join("\n");
writeFileSync(new URL("../supabase/SETUP_PRODUKTION.sql", import.meta.url), header + body + "\ncommit;\n\nselect 'ERLEN-Datenbank erfolgreich eingerichtet' as ergebnis;\n");
// Für die Einrichtungsseite der App (/einrichtung) als TypeScript-Modul
const sqlForApp = body + "\nnotify pgrst, 'reload schema';\n";
writeFileSync(
  new URL("../src/lib/setup-sql.generated.ts", import.meta.url),
  "// AUTOMATISCH ERZEUGT durch scripts/build-setup-sql.mjs – nicht von Hand bearbeiten.\n" +
    "export const SETUP_MIGRATIONS = " + JSON.stringify(files) + ";\n" +
    "export const SETUP_SQL = " + JSON.stringify(sqlForApp) + ";\n",
);
console.log("supabase/SETUP_PRODUKTION.sql und src/lib/setup-sql.generated.ts erstellt aus", files.length, "Migrationen");
