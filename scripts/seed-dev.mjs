// =============================================================================
// ERLEN CRM – Beispieldaten NUR für die lokale Entwicklungsumgebung
// =============================================================================
// Aufruf:  npm run seed:dev   (nach "npm run db:start" und "npm run db:reset")
// Legt Testbenutzer, Teams, Produkte, Leistungen, Ziele und einen Beispielkurs an.
// Das Skript verweigert die Ausführung gegen nicht-lokale Datenbanken.
// =============================================================================
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const dbUrl = process.env.DEV_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url) || !/@(127\.0\.0\.1|localhost):/.test(dbUrl)) {
  console.error("Abbruch: Beispieldaten dürfen nur lokal angelegt werden.");
  process.exit(1);
}

const admin = createClient(url, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const db = new pg.Client({ connectionString: dbUrl });
await db.connect();

export const DEV_PASSWORD = "Erlen-Dev-2026";
const people = [
  ["admin", "Alex", "Admin", "admin"],
  ["leitung", "Lena", "Leitner", "agenturleiter"],
  ["teamleiter.nord", "Tom", "Nordmann", "teamleiter"],
  ["teamleiter.sued", "Sara", "Südmeier", "teamleiter"],
  ["ausbilder", "Anna", "Bildner", "ausbilder"],
  ["partner1", "Paul", "Peters", "vertriebspartner"],
  ["partner2", "Mia", "Maier", "vertriebspartner"],
  ["partner3", "Jonas", "Becker", "vertriebspartner"],
  ["partner4", "Emma", "Schulz", "vertriebspartner"],
  ["partner5", "Leon", "Wagner", "vertriebspartner"],
];

const ids = {};
for (const [key, first, last, role] of people) {
  const email = `${key}@erlen.local`;
  const { data: existing } = await admin.auth.admin.listUsers({ perPage: 200 });
  let user = existing.users.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email, password: DEV_PASSWORD, email_confirm: true, user_metadata: { first_name: first, last_name: last },
    });
    if (error) throw error;
    user = data.user;
  }
  ids[key] = user.id;
  await db.query(
    `update public.profiles set role_id = (select id from public.roles where key = $2), status = 'aktiv', deactivated_at = null,
       first_name = $3, last_name = $4 where id = $1`,
    [user.id, role, first, last],
  );
}

const q = (sql, params = []) => db.query(sql, params);
const one = async (sql, params = []) => (await q(sql, params)).rows[0];

// Produkte
const products = {};
for (const [name, unit, ref, order] of [
  ["Glasfaser", "Verträge", false, 1],
  ["PV-Leads", "Leads", false, 2],
  ["Strom", "Verträge", false, 3],
  ["Gas", "Verträge", false, 4],
]) {
  products[name] = (await one(
    `insert into public.products (name, unit_label, requires_external_ref, sort_order) values ($1, $2, $3, $4)
     on conflict (lower(name)) do update set unit_label = excluded.unit_label returning id`,
    [name, unit, ref, order],
  )).id;
}

// Produktfreigaben (alle Beispielpersonen; partner4 verliert nach dem Anlegen der Leistungen „Gas“)
await q(
  "insert into public.user_products (user_id, product_id) select u, p from unnest($1::uuid[]) u, unnest($2::uuid[]) p on conflict do nothing",
  [Object.values(ids), Object.values(products)],
);

// Teams
const team = async (name, parent = null) =>
  (await one(
    `insert into public.teams (name, parent_team_id) values ($1, $2)
     on conflict (lower(name)) do update set parent_team_id = excluded.parent_team_id returning id`,
    [name, parent],
  )).id;
const nord = await team("Team Nord");
const sued = await team("Team Süd");

await q("delete from public.team_memberships where user_id = any($1)", [Object.values(ids)]);
await q("delete from public.reporting_relationships where employee_id = any($1)", [Object.values(ids)]);
const member = (t, u, r = "mitglied") => q("insert into public.team_memberships (team_id, user_id, member_role) values ($1, $2, $3)", [t, ids[u], r]);
await member(nord, "teamleiter.nord", "teamleiter");
await member(sued, "teamleiter.sued", "teamleiter");
for (const p of ["partner1", "partner2", "ausbilder"]) await member(nord, p);
for (const p of ["partner3", "partner4", "partner5"]) await member(sued, p);
const rel = (e, m, t) => q("insert into public.reporting_relationships (employee_id, manager_id, relation_type) values ($1, $2, $3)", [ids[e], ids[m], t]);
for (const p of ["partner1", "partner2", "ausbilder"]) await rel(p, "teamleiter.nord", "vorgesetzter");
for (const p of ["partner3", "partner4", "partner5"]) await rel(p, "teamleiter.sued", "vorgesetzter");
await rel("partner1", "ausbilder", "ausbilder");
await rel("partner2", "ausbilder", "ausbilder");
await q("update public.employee_details set phone = '0170 0000000', sales_region = 'Bayern', entry_date = current_date - 200, sales_start_date = current_date - 180, partner_status = 'aktiv' where user_id = any($1)", [Object.values(ids)]);

// Leistungen der letzten 120 Tage (deterministisch)
await q("delete from public.performance_records where user_id = any($1)", [Object.values(ids)]);
let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const sellers = [
  ["partner1", nord, 1.2], ["partner2", nord, 0.8], ["partner3", sued, 1.0], ["partner4", sued, 0.6], ["partner5", sued, 1.4], ["ausbilder", nord, 0.5],
];
const rows = [];
for (let d = 120; d >= 0; d--) {
  for (const [who, t, skill] of sellers) {
    const dow = new Date(Date.now() - d * 86400000).getDay();
    if (dow === 0 || rnd() < 0.25) continue;
    for (const [pname, base] of [["Glasfaser", 1.1], ["PV-Leads", 0.9], ["Strom", 0.4], ["Gas", 0.25]]) {
      const n = Math.floor(rnd() * base * skill * 2.2);
      if (n <= 0) continue;
      let status = "bestaetigt";
      const r = rnd();
      if (d <= 3 && r < 0.5) status = "eingereicht";
      else if (r < 0.04) status = "storniert";
      rows.push([ids[who], t, products[pname], d, n, status]);
    }
  }
}
for (const [u, t, p, d, n, status] of rows) {
  await q(
    `insert into public.performance_records (user_id, team_id, product_id, occurred_on, quantity, status, created_by, submitted_at,
       confirmed_at, confirmed_by, cancelled_at, status_reason)
     values ($1, $2, $3, current_date - $4::int, $5, $6::text::public.performance_status, $1, now(),
       case when $6::text in ('bestaetigt','storniert') then now() end, case when $6::text in ('bestaetigt','storniert') then $7::uuid end,
       case when $6::text = 'storniert' then now() end, case when $6::text = 'storniert' then 'Kunde hat widerrufen (Beispiel)' end)`,
    [u, t, p, d, n, status, ids["teamleiter.nord"]],
  );
}

await q("delete from public.user_products where user_id = $1 and product_id = $2", [ids.partner4, products.Gas]);

// Provisionssätze je Stufe und Produkt (Beispielwerte in Cent je Einheit)
await q("delete from public.commission_levels where key is null");
await q("delete from public.commission_rates");
const levels = Object.fromEntries((await q("select key, id from public.commission_levels where key is not null")).rows.map((r) => [r.key, r.id]));
const rateTable = {
  vertriebspartner: { Glasfaser: 3000, "PV-Leads": 500, Strom: 1500, Gas: 1500 },
  ausbilder: { Glasfaser: 4000, "PV-Leads": 700, Strom: 2000, Gas: 2000 },
  teamleiter: { Glasfaser: 5000, "PV-Leads": 900, Strom: 2500, Gas: 2500 },
  agentur: { Glasfaser: 8000, "PV-Leads": 1500, Strom: 4000, Gas: 4000 },
};
for (const [lvl, rates] of Object.entries(rateTable)) {
  for (const [prod, cents] of Object.entries(rates)) {
    await q("insert into public.commission_rates (level_id, product_id, amount_cents) values ($1, $2, $3)", [levels[lvl], products[prod], cents]);
  }
}
for (const who of ["partner1", "partner2", "partner3", "partner4", "partner5", "ausbilder", "teamleiter.nord", "teamleiter.sued"]) {
  await q(
    `insert into public.employee_billing (user_id, street, postal_code, city, vat_liable)
     values ($1, 'Musterstraße 1', '57612', 'Helmenzen', $2)
     on conflict (user_id) do update set commission_level_id = null`,
    [ids[who], who === "partner3"],
  );
}
// Beispiel-Zusatzposition: Fahrzeug über die Agentur
await q("delete from public.statement_extras where user_id = any($1)", [Object.values(ids)]);
await q("insert into public.statement_extras (user_id, description, amount_cents, recurring) values ($1, 'Fahrzeugrate (Beispiel)', -39900, true)", [ids.partner1]);
await q("delete from public.statements where user_id = any($1)", [Object.values(ids)]);

// Ziele
await q("delete from public.targets");
await q(
  `insert into public.targets (title, scope, user_id, period, starts_on, ends_on, target_value)
   select 'Monatsziel ' || p.first_name, 'mitarbeiter', p.id, 'monat', date_trunc('month', current_date)::date,
          (date_trunc('month', current_date) + interval '11 months')::date + 30, 45
   from public.profiles p where p.id = any($1)`,
  [[ids.partner1, ids.partner2, ids.partner3, ids.partner4, ids.partner5]],
);
await q(
  `insert into public.targets (title, scope, team_id, period, starts_on, ends_on, target_value)
   values ('Teamziel Nord', 'team', $1, 'monat', date_trunc('month', current_date)::date, current_date + 365, 150),
          ('Teamziel Süd', 'team', $2, 'monat', date_trunc('month', current_date)::date, current_date + 365, 180)`,
  [nord, sued],
);
await q(
  `insert into public.targets (title, scope, period, starts_on, ends_on, target_value, product_id)
   values ('Agenturziel Glasfaser', 'agentur', 'monat', date_trunc('month', current_date)::date, current_date + 365, 200, $1)`,
  [products.Glasfaser],
);
await q("delete from public.competitions");
await q(
  `insert into public.competitions (title, description, product_id, starts_on, ends_on)
   values ('Glasfaser-Challenge', 'Wer schließt in diesem Monat die meisten Glasfaser-Verträge ab?', $1,
           date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date)`,
  [products.Glasfaser],
);

// Academy-Beispielkurs
await q("delete from public.courses where title = 'Grundlagen des Vertriebs'");
const course = (await one(
  `insert into public.courses (title, description, status, published_at) values
   ('Grundlagen des Vertriebs', 'Pflichtschulung für neue Vertriebspartner: Gesprächsführung, Einwandbehandlung und Abschluss.', 'veroeffentlicht', now()) returning id`,
)).id;
const mod1 = (await one("insert into public.course_modules (course_id, title, sort_order) values ($1, 'Modul 1 – Einstieg', 1) returning id", [course])).id;
const mod2 = (await one("insert into public.course_modules (course_id, title, sort_order) values ($1, 'Modul 2 – Praxis', 2) returning id", [course])).id;
await q(
  `insert into public.lessons (module_id, title, lesson_type, content, min_seconds, sort_order, is_published, published_at) values
   ($1, 'Willkommen bei ERLEN', 'text', $3, 10, 1, true, now()),
   ($1, 'Unsere Produkte im Überblick', 'text', $4, 10, 2, true, now()),
   ($2, 'Einwandbehandlung', 'text', $5, 10, 1, true, now())`,
  [
    mod1,
    mod2,
    "# Willkommen\n\nSchön, dass du da bist! In diesem Kurs lernst du die **Grundlagen** unseres Vertriebs.\n\n- Unsere Werte\n- Ablauf eines Kundengesprächs\n- Deine ersten Schritte",
    "## Produkte\n\n1. **Glasfaser** – schnelles Internet für Haushalte\n2. **PV-Leads** – qualifizierte Interessenten für Photovoltaik\n3. **Strom & Gas** – Energieverträge",
    "## Einwände sind Chancen\n\n> „Zu teuer“ heißt oft: „Ich sehe den Nutzen noch nicht.“\n\nHöre aktiv zu, frage nach und fasse den Nutzen zusammen.",
  ],
);
const quizLesson = (await one(
  "insert into public.lessons (module_id, title, lesson_type, min_seconds, sort_order, is_published, published_at) values ($1, 'Wissenstest', 'quiz', 0, 2, true, now()) returning id",
  [mod2],
)).id;
const quiz = (await one("insert into public.quizzes (lesson_id, pass_percent) values ($1, 70) returning id", [quizLesson])).id;
const qs = [
  ["Was bedeutet der Einwand „zu teuer“ häufig?", [["Der Kunde sieht den Nutzen noch nicht", true], ["Das Gespräch ist beendet", false], ["Der Kunde hat kein Geld", false]]],
  ["Welche Produkte vertreibt ERLEN? (Mehrfachauswahl)", [["Glasfaser", true], ["PV-Leads", true], ["Versicherungen", false]], true],
];
let order = 0;
for (const [question, answers, multi] of qs) {
  const qid = (await one("insert into public.quiz_questions (quiz_id, question, allows_multiple, sort_order) values ($1, $2, $3, $4) returning id", [quiz, question, !!multi, ++order])).id;
  let ao = 0;
  for (const [a, c] of answers) await q("insert into public.quiz_answers (question_id, answer, is_correct, sort_order) values ($1, $2, $3, $4)", [qid, a, c, ++ao]);
}
await q(
  `insert into public.course_access (course_id, role_id, is_mandatory)
   select $1, id, key = 'vertriebspartner' from public.roles where key in ('vertriebspartner', 'ausbilder', 'teamleiter')`,
  [course],
);
for (const id of Object.values(ids)) {
  await q("select set_config('request.jwt.claims', '{}', true)");
  await q(`select private.assign_mandatory_courses($1)`, [id]);
}

// Dokumentkategorien
for (const [n, i] of [["Vertriebsleitfäden", 1], ["Skripte", 2], ["Richtlinien", 3], ["Schulungsunterlagen", 4]]) {
  await q("insert into public.document_categories (name, sort_order) values ($1, $2) on conflict do nothing", [n, i]);
}
await q("delete from public.announcements");
await q(
  `insert into public.announcements (title, body, is_pinned, created_by) values
   ('Willkommen im neuen ERLEN-Portal', 'Ab sofort findet ihr hier eure Leistungen, Ziele, Schulungen und Unterlagen. Feedback gerne an die Teamleitung.', true, $1)`,
  [ids.leitung],
);

await db.end();
console.log("Beispieldaten angelegt. Anmeldung z. B. mit admin@erlen.local / " + DEV_PASSWORD);
console.log("Weitere Konten: leitung@, teamleiter.nord@, teamleiter.sued@, ausbilder@, partner1@ … partner5@ (alle @erlen.local)");
