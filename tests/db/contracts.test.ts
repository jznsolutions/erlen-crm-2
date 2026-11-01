import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, asUserKeep, close, connect, expectDbError, one, type Db } from "./helpers";
import { createOrg, type Org } from "./fixtures";

let db: Db;
let o: Org;
let tpl: string;

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
  await db.query("insert into storage.objects (bucket_id, name) values ('contracts', 'vorlagen/t.pdf')");
  tpl = await asUserKeep(db, o.agenturleiter, async () =>
    (await one<{ id: string }>(db, "select public.contract_template_register('Handelsvertretervertrag', 'vorlagen/t.pdf', 't.pdf', true) id")).id);
});
afterAll(async () => close(db));

describe("Digitale Vertragsunterschrift", () => {
  it("Verwaltung weist zu, doppelt geht nicht; Partner dürfen nicht zuweisen", async () => {
    const id = await asUserKeep(db, o.agenturleiter, async () => (await one<{ id: string }>(db, "select public.contract_request_create($1, $2) id", [o.partner1, tpl])).id);
    expect(id).toBeTruthy();
    await asUser(db, o.agenturleiter, async () => {
      await expectDbError(db, "select public.contract_request_create($1, $2)", [o.partner1, tpl], /bereits zugewiesen/);
    });
    await asUser(db, o.partner2, async () => {
      await expectDbError(db, "select public.contract_request_create($1, $2)", [o.partner2, tpl], /Berechtigung/);
      // Fremde Anfragen sind unsichtbar
      expect((await db.query("select 1 from public.contract_requests where user_id = $1", [o.partner1])).rows).toHaveLength(0);
    });
    const n = await one<{ c: number }>(db, "select count(*)::int c from public.notifications where user_id = $1 and type = 'vertrag'", [o.partner1]);
    expect(n.c).toBe(1);
  });

  it("Unterschrift nur durch die Person selbst, nur mit abgelegtem Dokument, danach als geprüfte Unterlage", async () => {
    const id = (await one<{ id: string }>(db, "select id from public.contract_requests where user_id = $1", [o.partner1])).id;
    const path = `${o.partner1}/vertrag-1.pdf`;
    await asUser(db, o.partner2, async () => {
      await expectDbError(db, "select public.contract_sign_complete($1, 'X Y Z', $2, repeat('a', 64), 100)", [id, path], /nicht gefunden/);
    });
    await asUser(db, o.partner1, async () => {
      await expectDbError(db, "select public.contract_sign_complete($1, 'Pa Rtner', $2, repeat('a', 64), 100)", [id, path], /Dokument fehlt/);
    });
    await db.query("insert into storage.objects (bucket_id, name) values ('employee-docs', $1)", [path]);
    await asUserKeep(db, o.partner1, async () => {
      await db.query("select public.contract_sign_complete($1, 'Pa Rtner', $2, repeat('a', 64), 100)", [id, path]);
    });
    expect(await one(db, "select status, signed_name from public.contract_requests where id = $1", [id])).toEqual({ status: "unterschrieben", signed_name: "Pa Rtner" });
    expect(await one(db, "select category, status from public.employee_documents where storage_path = $1", [path])).toEqual({ category: "vertrag", status: "geprueft" });
    await asUser(db, o.partner1, async () => {
      await expectDbError(db, "select public.contract_sign_complete($1, 'Pa Rtner', $2, repeat('a', 64), 100)", [id, path], /nicht mehr offen/);
    });
  });

  it("neue Mitarbeitende bekommen Vorlagen mit „automatisch“ beim Aktivwerden", async () => {
    await db.query("update public.profiles set status = 'deaktiviert' where id = $1", [o.partner3]);
    await db.query("update public.profiles set status = 'aktiv' where id = $1", [o.partner3]);
    expect((await one<{ c: number }>(db, "select count(*)::int c from public.contract_requests where user_id = $1 and template_id = $2", [o.partner3, tpl])).c).toBe(1);
    // Erneutes Aktivieren erzeugt keine zweite Anfrage
    await db.query("update public.profiles set status = 'deaktiviert' where id = $1", [o.partner3]);
    await db.query("update public.profiles set status = 'aktiv' where id = $1", [o.partner3]);
    expect((await one<{ c: number }>(db, "select count(*)::int c from public.contract_requests where user_id = $1 and template_id = $2", [o.partner3, tpl])).c).toBe(1);
  });
});
