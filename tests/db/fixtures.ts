import { createUser, one, type Db } from "./helpers";

// Testorganisation:
//  Team Alpha (Leitung: teamleiterA) – Mitglieder: partner1, partner2
//    └─ Unterteam Alpha Junior – Mitglied: partner4
//  Team Beta  (Leitung: teamleiterB) – Mitglied: partner3
//  ausbilder ist Ausbilder von partner1
//  inaktiv: deaktivierter Vertriebspartner
export type Org = Awaited<ReturnType<typeof createOrg>>;

export async function createOrg(db: Db) {
  const u = async (key: string, role: string, status: "aktiv" | "deaktiviert" = "aktiv") =>
    createUser(db, { email: `${key}@test.erlen.local`, first: key, last: "Test", role, status });

  const admin = await u("admin", "admin");
  const agenturleiter = await u("agenturleiter", "agenturleiter");
  const teamleiterA = await u("teamleitera", "teamleiter");
  const teamleiterB = await u("teamleiterb", "teamleiter");
  const ausbilder = await u("ausbilder", "ausbilder");
  const partner1 = await u("partner1", "vertriebspartner");
  const partner2 = await u("partner2", "vertriebspartner");
  const partner3 = await u("partner3", "vertriebspartner");
  const partner4 = await u("partner4", "vertriebspartner");
  const inaktiv = await u("inaktiv", "vertriebspartner", "deaktiviert");

  const team = async (name: string, parent: string | null = null) =>
    (await one<{ id: string }>(db, "insert into public.teams (name, parent_team_id) values ($1, $2) returning id", [
      name,
      parent,
    ])).id;
  const alpha = await team("Alpha");
  const alphaJunior = await team("Alpha Junior", alpha);
  const beta = await team("Beta");

  const member = (t: string, user: string, role = "mitglied") =>
    db.query("insert into public.team_memberships (team_id, user_id, member_role) values ($1, $2, $3)", [t, user, role]);
  await member(alpha, teamleiterA, "teamleiter");
  await member(beta, teamleiterB, "teamleiter");
  await member(alpha, partner1);
  await member(alpha, partner2);
  await member(alphaJunior, partner4);
  await member(beta, partner3);
  await member(alpha, ausbilder);

  await db.query(
    "insert into public.reporting_relationships (employee_id, manager_id, relation_type) values ($1, $2, 'ausbilder')",
    [partner1, ausbilder],
  );

  const product = (
    await one<{ id: string }>(db, "insert into public.products (name, unit_label) values ('Glasfaser', 'Verträge') returning id")
  ).id;
  const productRef = (
    await one<{ id: string }>(
      db,
      "insert into public.products (name, unit_label, requires_external_ref) values ('PV-Leads', 'Leads', true) returning id",
    )
  ).id;

  // Produktfreigaben: alle Testpersonen dürfen beide Produkte erfassen
  await db.query(
    "insert into public.user_products (user_id, product_id) select p.id, pr.id from public.profiles p cross join public.products pr",
  );

  return {
    admin, agenturleiter, teamleiterA, teamleiterB, ausbilder,
    partner1, partner2, partner3, partner4, inaktiv,
    alpha, alphaJunior, beta, product, productRef,
  };
}

/** Legt eine bestätigte Leistung direkt als Superuser an (Testdaten). */
export async function insertRecord(
  db: Db,
  user: string,
  product: string,
  opts: { quantity?: number; day?: string; status?: string; team?: string | null; ref?: string } = {},
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    `insert into public.performance_records (user_id, team_id, product_id, occurred_on, quantity, status, created_by,
        external_ref, confirmed_at)
     values ($1, $2, $3, coalesce($4::date, private.today_berlin()), $5, $6::public.performance_status, $1, $7,
        case when $6 = 'bestaetigt' then now() end)
     returning id`,
    [user, opts.team ?? null, product, opts.day ?? null, opts.quantity ?? 1, opts.status ?? "bestaetigt", opts.ref ?? null],
  );
  return r.id;
}
