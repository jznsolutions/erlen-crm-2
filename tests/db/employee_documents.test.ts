import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, asUserKeep, close, connect, expectDbError, one, type Db } from "./helpers";
import { createOrg, type Org } from "./fixtures";

let db: Db;
let o: Org;

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
});
afterAll(async () => close(db));

async function fakeFile(owner: string) {
  const name = `${owner}/${crypto.randomUUID()}.pdf`;
  await db.query("insert into storage.objects (bucket_id, name, owner) values ('employee-docs', $1, $2)", [name, owner]);
  return name;
}
const register = (user: string, path: string) =>
  db.query("select public.employee_document_register($1, 'fuehrerschein', 'Vorderseite', $2, 'fs.pdf', 'application/pdf', 1000, null) id", [user, path]);

describe("Mitarbeiter-Unterlagen", () => {
  it("Mitarbeiter laden eigene Unterlagen hoch; die Verwaltung wird benachrichtigt", async () => {
    await db.query("savepoint a");
    const path = await fakeFile(o.partner1);
    await asUserKeep(db, o.partner1, async () => {
      await register(o.partner1, path);
    });
    const n = await one<{ c: string }>(db, "select count(*) c from public.notifications where type = 'unterlage_neu' and user_id = $1", [o.admin]);
    expect(Number(n.c)).toBe(1);
    await db.query("rollback to savepoint a");
  });
  it("niemand sonst (auch nicht der Teamleiter) sieht die Unterlagen", async () => {
    await db.query("savepoint b");
    const path = await fakeFile(o.partner1);
    await asUserKeep(db, o.partner1, async () => {
      await register(o.partner1, path);
    });
    for (const other of [o.partner2, o.teamleiterA, o.ausbilder]) {
      await asUser(db, other, async () => {
        expect((await db.query("select * from public.employee_documents")).rowCount).toBe(0);
      });
    }
    await asUser(db, o.agenturleiter, async () => {
      expect((await db.query("select * from public.employee_documents")).rowCount).toBe(1);
    });
    await db.query("rollback to savepoint b");
  });
  it("für andere hochladen und prüfen darf nur die Verwaltung; Geprüftes kann der Mitarbeiter nicht löschen", async () => {
    await db.query("savepoint c");
    const path = await fakeFile(o.partner2);
    await asUser(db, o.partner1, async () => {
      await expectDbError(db, "select public.employee_document_register($1, 'sonstiges', null, $2, 'x.pdf', 'application/pdf', 10, null)", [o.partner2, path], /Berechtigung/);
    });
    const own = await fakeFile(o.partner1);
    let id = "";
    await asUserKeep(db, o.partner1, async () => {
      id = (await register(o.partner1, own)).rows[0].id;
    });
    await asUser(db, o.partner1, async () => {
      await expectDbError(db, "select public.employee_document_review($1, 'geprueft', null)", [id], /Berechtigung/);
    });
    await asUserKeep(db, o.admin, async () => {
      await db.query("select public.employee_document_review($1, 'geprueft', null)", [id]);
    });
    await asUser(db, o.partner1, async () => {
      await expectDbError(db, "select public.employee_document_delete($1)", [id], /bereits geprüft/);
    });
    await db.query("rollback to savepoint c");
  });
  it("Ablageort muss zum Mitarbeiter gehören", async () => {
    const foreign = await fakeFile(o.partner2);
    await asUser(db, o.partner1, async () => {
      await expectDbError(db, "select public.employee_document_register($1, 'sonstiges', null, $2, 'x.pdf', 'application/pdf', 10, null)", [o.partner1, foreign], /Ablageort/);
    });
  });
});
