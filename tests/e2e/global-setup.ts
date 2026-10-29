import pg from "pg";

// Bereitet die lokale Entwicklungsdatenbank für wiederholbare E2E-Läufe vor.
export default async function globalSetup() {
  const url = process.env.TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  if (!/@(127\.0\.0\.1|localhost):/.test(url)) throw new Error("E2E-Setup nur gegen lokale Datenbanken");
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  await db.query("delete from private.rate_limits");
  await db.query("delete from public.lesson_progress where user_id = (select id from public.profiles where email = 'partner3@erlen.local')");
  // Abrechnungen der Beispielpersonen zurücksetzen (sonst greift beim erneuten Lauf der Doppel-Schutz)
  await db.query("delete from public.bookings");
  await db.query("delete from public.statements where user_id in (select id from public.profiles where email like '%@erlen.local')");
  await db.end();
}
