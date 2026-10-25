import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, close, connect, expectDbError, ids, one, type Db } from "./helpers";
import { createOrg, insertRecord, type Org } from "./fixtures";

let db: Db;
let o: Org;

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
  for (const u of [o.partner1, o.partner2, o.partner3, o.partner4, o.teamleiterA]) {
    await insertRecord(db, u, o.product, { quantity: 2 });
  }
});
afterAll(async () => close(db));

const visibleProfiles = () => ids(db, "select id from public.profiles");
const visibleRecordOwners = () => ids(db, "select distinct user_id from public.performance_records");

describe("Szenario 1: Vertriebspartner sieht nur eigene geschützte Daten", () => {
  it("Profile: nur sich selbst sowie eigene Ansprechpartner (Teamleitung, Ausbilder)", async () => {
    const rows = await asUser(db, o.partner1, visibleProfiles);
    expect(rows).toEqual([o.partner1, o.teamleiterA, o.ausbilder].sort());
  });
  it("Zusatzdaten (Telefon etc.) nur die eigenen", async () => {
    const rows = await asUser(db, o.partner1, () => ids(db, "select user_id from public.employee_details"));
    expect(rows).toEqual([o.partner1]);
  });
  it("Leistungsdaten nur die eigenen", async () => {
    expect(await asUser(db, o.partner1, visibleRecordOwners)).toEqual([o.partner1]);
  });
  it("Manipulierte ID: Leistung für fremden Mitarbeiter anlegen wird abgelehnt", async () => {
    await asUser(db, o.partner1, () =>
      expectDbError(db, "select public.performance_create($1, $2, current_date, 1)", [o.partner2, o.product], /Keine Berechtigung/),
    );
  });
  it("Profilhistorie fremder Mitarbeiter ist gesperrt", async () => {
    await asUser(db, o.partner1, () =>
      expectDbError(db, "select * from public.get_profile_history($1)", [o.partner2], /Keine Berechtigung/),
    );
  });
  it("Audit-Logs sind nicht lesbar", async () => {
    const n = await asUser(db, o.partner1, () => one<{ n: string }>(db, "select count(*) n from public.audit_logs"));
    expect(Number(n.n)).toBe(0);
  });
});

describe("Szenario 2: Ausbilder sieht ausschließlich zugewiesene Mitarbeiter", () => {
  it("Leistungsdaten: sich selbst und partner1", async () => {
    expect(await asUser(db, o.ausbilder, visibleRecordOwners)).toEqual([o.partner1]);
    const prof = await asUser(db, o.ausbilder, visibleProfiles);
    expect(prof).toContain(o.partner1);
    expect(prof).not.toContain(o.partner2);
    expect(prof).not.toContain(o.partner3);
  });
  it("kann Lernfortschritt nur für Zugewiesene dokumentieren und Notizen nur für diese anlegen", async () => {
    await asUser(db, o.ausbilder, async () => {
      await db.query("select public.training_note_add($1, 'Gutes Gespräch', true)", [o.partner1]);
      await expectDbError(db, "select public.training_note_add($1, 'x')", [o.partner2], /Keine Berechtigung/);
    });
  });
  it("Zuordnung beendet -> Zugriff entfällt sofort", async () => {
    await db.query("savepoint s");
    await db.query("update public.reporting_relationships set ended_at = now() where employee_id = $1", [o.partner1]);
    expect(await asUser(db, o.ausbilder, visibleRecordOwners)).toEqual([]);
    await db.query("rollback to savepoint s");
  });
});

describe("Szenario 3: Teamleiter sieht nur zugeordnete Teams", () => {
  it("Teamleiter A sieht Alpha-Mitglieder, nicht Beta und nicht das Unterteam ohne Freigabe", async () => {
    const owners = await asUser(db, o.teamleiterA, visibleRecordOwners);
    expect(owners).toEqual([o.partner1, o.partner2, o.teamleiterA].sort());
    expect(owners).not.toContain(o.partner3);
    expect(owners).not.toContain(o.partner4);
  });
  it("mit ausdrücklicher Unterteam-Freigabe sieht er auch das Unterteam", async () => {
    await db.query("savepoint s");
    await db.query(
      "update public.team_memberships set includes_subteams = true where user_id = $1 and member_role = 'teamleiter'",
      [o.teamleiterA],
    );
    expect(await asUser(db, o.teamleiterA, visibleRecordOwners)).toContain(o.partner4);
    await db.query("rollback to savepoint s");
  });
  it("Teams: sieht eigenes Team, nicht fremde", async () => {
    const teams = await asUser(db, o.teamleiterA, () => ids(db, "select id from public.teams"));
    expect(teams).toEqual([o.alpha]);
  });
  it("kann Leistungen fremder Teams nicht bestätigen", async () => {
    const rec = await insertRecord(db, o.partner3, o.product, { status: "eingereicht" });
    await asUser(db, o.teamleiterA, () =>
      expectDbError(db, "select public.performance_transition($1, 'bestaetigen')", [rec], /Keine Berechtigung/),
    );
  });
});

describe("Szenario 4: Agenturleiter sieht agenturweite Kennzahlen", () => {
  it("sieht alle Leistungsdaten und Profile", async () => {
    const owners = await asUser(db, o.agenturleiter, visibleRecordOwners);
    expect(owners).toEqual([o.partner1, o.partner2, o.partner3, o.partner4, o.teamleiterA].sort());
    const prof = await asUser(db, o.agenturleiter, visibleProfiles);
    expect(prof.length).toBeGreaterThanOrEqual(10);
  });
  it("Aggregation performance_daily liefert Agentursumme", async () => {
    const r = await asUser(db, o.agenturleiter, () =>
      one<{ s: string }>(
        db,
        "select sum(quantity) s from public.performance_daily(current_date - 1, current_date) where status = 'bestaetigt'",
      ),
    );
    expect(Number(r.s)).toBe(10);
  });
  it("hat keinen Zugriff auf Audit-Logs und kann keine Rollen vergeben", async () => {
    await asUser(db, o.agenturleiter, async () => {
      const n = await one<{ n: string }>(db, "select count(*) n from public.audit_logs");
      expect(Number(n.n)).toBe(0);
      await expectDbError(db, "select public.admin_set_user_role($1, 'teamleiter')", [o.partner1], /Keine Berechtigung/);
    });
  });
});

describe("Szenario 5: Keine Selbst-Ernennung zum Administrator", () => {
  it("direktes UPDATE auf profiles ist verboten", async () => {
    await asUser(db, o.partner1, () =>
      expectDbError(
        db,
        "update public.profiles set role_id = (select id from public.roles where key = 'admin') where id = $1",
        [o.partner1],
        /permission denied/,
      ),
    );
  });
  it("direktes INSERT in user_permissions / role_permissions ist verboten", async () => {
    await asUser(db, o.partner1, async () => {
      await expectDbError(
        db,
        "insert into public.user_permissions (user_id, permission_key, effect) values ($1, 'roles.assign', 'grant')",
        [o.partner1],
        /permission denied/,
      );
      await expectDbError(
        db,
        "insert into public.role_permissions (role_id, permission_key) select id, 'roles.assign' from public.roles where key = 'vertriebspartner'",
        [],
        /permission denied/,
      );
    });
  });
  it("RPCs zur Rollenvergabe sind gesperrt", async () => {
    await asUser(db, o.partner1, async () => {
      await expectDbError(db, "select public.admin_set_user_role($1, 'admin')", [o.partner1], /Keine Berechtigung|eigene Rolle/);
      await expectDbError(db, "select public.admin_set_user_permission($1, 'roles.assign', 'grant')", [o.partner1], /Keine Berechtigung|Eigene/);
    });
  });
  it("bootstrap_admin ist für angemeldete Benutzer nicht ausführbar", async () => {
    await asUser(db, o.partner1, () =>
      expectDbError(db, "select public.bootstrap_admin('partner1@test.erlen.local')", [], /permission denied/),
    );
  });
  it("auch ein Administrator kann seine eigene Rolle nicht ändern; der letzte Admin bleibt erhalten", async () => {
    await asUser(db, o.admin, () =>
      expectDbError(db, "select public.admin_set_user_role($1, 'vertriebspartner')", [o.admin], /eigene Rolle/),
    );
  });
  it("Administrator kann Rollen vergeben (und es wird protokolliert)", async () => {
    await asUser(db, o.admin, async () => {
      await db.query("select public.admin_set_user_role($1, 'ausbilder')", [o.partner2]);
      const log = await one<{ n: string }>(
        db,
        "select count(*) n from public.audit_logs where table_name = 'profiles' and subject_user_id = $1 and action = 'update'",
        [o.partner2],
      );
      expect(Number(log.n)).toBeGreaterThan(0);
    });
  });
  it("individuelle Sperre (deny) überschreibt die Rolle", async () => {
    await db.query("savepoint s");
    await db.query(
      "insert into public.user_permissions (user_id, permission_key, effect) values ($1, 'performance.read.team', 'deny')",
      [o.teamleiterA],
    );
    expect(await asUser(db, o.teamleiterA, visibleRecordOwners)).toEqual([o.teamleiterA]);
    await db.query("rollback to savepoint s");
  });
  it("Audit-Logs sind auch für Administratoren unveränderlich", async () => {
    await asUser(db, o.admin, () => expectDbError(db, "delete from public.audit_logs", [], /permission denied/));
    await expectDbError(db, "delete from public.audit_logs where id = (select min(id) from public.audit_logs)", [], /unveränderlich/);
  });
});

describe("Szenario 6: Teamwechsel aktualisiert die Datenzugriffsrechte", () => {
  it("nach Wechsel von Alpha nach Beta sieht Teamleiter B partner2, Teamleiter A nicht mehr", async () => {
    await db.query("savepoint s");
    await asUser(db, o.agenturleiter, async () => {
      // asUser rollt zurück – daher Wechsel direkt als Superuser über die Geschäftslogik nachstellen
    });
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: o.agenturleiter, role: "authenticated" }),
    ]);
    await db.query("select public.team_assign_member($1, $2)", [o.beta, o.partner2]);
    await db.query("reset role");

    expect(await asUser(db, o.teamleiterB, visibleRecordOwners)).toContain(o.partner2);
    expect(await asUser(db, o.teamleiterA, visibleRecordOwners)).not.toContain(o.partner2);

    const history = await one<{ n: string }>(
      db,
      "select count(*) n from public.team_memberships where user_id = $1 and ended_at is not null and end_reason = 'Teamwechsel'",
      [o.partner2],
    );
    expect(Number(history.n)).toBe(1);
    const notif = await one<{ n: string }>(
      db,
      "select count(*) n from public.notifications where user_id = $1 and type = 'team_geaendert'",
      [o.partner2],
    );
    expect(Number(notif.n)).toBe(1);
    await db.query("rollback to savepoint s");
  });
  it("Teamleiter darf Teams nicht selbst umorganisieren", async () => {
    await asUser(db, o.teamleiterA, () =>
      expectDbError(db, "select public.team_assign_member($1, $2)", [o.alpha, o.partner3], /Keine Berechtigung/),
    );
  });
});

describe("Szenario 9: Private Dokumente ohne Berechtigung nicht abrufbar", () => {
  it("Dokument mit Freigabe nur für Teamleiter ist für Vertriebspartner unsichtbar (Tabelle und Storage)", async () => {
    await db.query("savepoint s");
    await db.query(
      `insert into storage.objects (bucket_id, name, owner_id) values ('documents', 'test/leitfaden.pdf', $1)`,
      [o.admin],
    );
    const doc = await one<{ id: string }>(
      db,
      `insert into public.documents (title, storage_path, file_name, mime_type, size_bytes)
       values ('Leitfaden Teamleitung', 'test/leitfaden.pdf', 'leitfaden.pdf', 'application/pdf', 100) returning id`,
    );
    await db.query(
      "insert into public.document_permissions (document_id, role_id) select $1, id from public.roles where key = 'teamleiter'",
      [doc.id],
    );
    const asPartner = await asUser(db, o.partner1, async () => ({
      docs: await ids(db, "select id from public.documents"),
      objects: await ids(db, "select name from storage.objects where bucket_id = 'documents'"),
    }));
    expect(asPartner.docs).toEqual([]);
    expect(asPartner.objects).toEqual([]);

    const asLead = await asUser(db, o.teamleiterA, async () => ({
      docs: await ids(db, "select id from public.documents"),
      objects: await ids(db, "select name from storage.objects where bucket_id = 'documents'"),
    }));
    expect(asLead.docs).toEqual([doc.id]);
    expect(asLead.objects).toEqual(["test/leitfaden.pdf"]);
    await db.query("rollback to savepoint s");
  });
  it("Vertriebspartner kann keine Dateien in den Dokumenten-Bucket hochladen", async () => {
    await asUser(db, o.partner1, () =>
      expectDbError(
        db,
        "insert into storage.objects (bucket_id, name, owner_id) values ('documents', 'hack.pdf', $1)",
        [o.partner1],
        /row-level security/,
      ),
    );
  });
});

describe("Szenario 10: Nicht angemeldete Benutzer erhalten keine geschützten Daten", () => {
  it("anon hat keinen Tabellenzugriff", async () => {
    for (const table of ["profiles", "performance_records", "documents", "audit_logs", "applicants", "invitations"]) {
      await asUser(db, null, () => expectDbError(db, `select * from public.${table}`, [], /permission denied/));
    }
  });
  it("anon kann keine RPCs ausführen", async () => {
    await asUser(db, null, () => expectDbError(db, "select public.my_permissions()", [], /permission denied/));
  });
  it("deaktivierte Konten sehen nichts, obwohl ein Token existiert", async () => {
    const rows = await asUser(db, o.inaktiv, async () => ({
      profiles: await ids(db, "select id from public.profiles"),
      perms: await one<{ p: string[] }>(db, "select public.my_permissions() p"),
      products: await ids(db, "select id from public.products"),
    }));
    expect(rows.profiles).toEqual([]);
    expect(rows.perms.p).toEqual([]);
    expect(rows.products).toEqual([]);
  });
});

describe("Weitere Schutzmechanismen", () => {
  it("Quiz-Lösungen sind für Lernende nicht lesbar", async () => {
    const n = await asUser(db, o.partner1, () => one<{ n: string }>(db, "select count(*) n from public.quiz_answers"));
    expect(Number(n.n)).toBe(0);
  });
  it("Bewerbungen sind nur mit Berechtigung lesbar", async () => {
    await db.query("savepoint s");
    await db.query(
      "insert into public.applicants (full_name, email, phone, consent_at) values ('Max Muster', 'max@example.com', '0170 1234567', now())",
    );
    const partner = await asUser(db, o.partner1, () => ids(db, "select id from public.applicants"));
    const lead = await asUser(db, o.agenturleiter, () => ids(db, "select id from public.applicants"));
    expect(partner).toEqual([]);
    expect(lead).toHaveLength(1);
    await db.query("rollback to savepoint s");
  });
  it("Benachrichtigungen: nur eigene", async () => {
    await db.query("savepoint s");
    await db.query("insert into public.notifications (user_id, type, title) values ($1, 'x', 'Für partner2')", [o.partner2]);
    expect(await asUser(db, o.partner1, () => ids(db, "select id from public.notifications"))).toEqual([]);
    await db.query("rollback to savepoint s");
  });
  it("Einladung höherer Rollen erfordert Rechtevergabe-Berechtigung", async () => {
    await db.query("savepoint s");
    await db.query(
      "insert into public.user_permissions (user_id, permission_key, effect) values ($1, 'employees.invite', 'grant')",
      [o.agenturleiter],
    );
    await asUser(db, o.agenturleiter, async () => {
      await db.query(
        "select public.invitation_create('neu@test.erlen.local', 'Neu', 'Partner', 'vertriebspartner', null, null, null, repeat('a', 64))",
      );
      await expectDbError(
        db,
        "select public.invitation_create('neu2@test.erlen.local', 'Neu', 'Admin', 'admin', null, null, null, repeat('b', 64))",
        [],
        /Keine Berechtigung \(roles.assign\)/,
      );
    });
    await db.query("rollback to savepoint s");
  });
  it("invitation_lookup ist nur serverseitig (service_role) aufrufbar", async () => {
    await asUser(db, o.admin, () =>
      expectDbError(db, "select * from public.invitation_lookup(repeat('a', 64))", [], /permission denied/),
    );
  });
});
