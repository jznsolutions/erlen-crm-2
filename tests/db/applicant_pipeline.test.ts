import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, close, connect, expectDbError, one, type Db } from "./helpers";
import { createOrg, type Org } from "./fixtures";

let db: Db;
let o: Org;
let id: string;

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
  id = (await one<{ id: string }>(db, "insert into public.applicants (full_name, email, phone, consent_at, notes) values ('Test Person', 't@example.com', '0170 1234567', now(), 'Notiz bleibt') returning id")).id;
});
afterAll(async () => close(db));

describe("Bewerber-Pipeline", () => {
  it("Verwaltung verschiebt in „Probetag“, Notiz bleibt erhalten", async () => {
    await asUser(db, o.agenturleiter, async () => {
      await db.query("select public.applicant_move($1, 'probetag')", [id]);
      expect(await one(db, "select status, notes from public.applicants where id = $1", [id])).toEqual({ status: "probetag", notes: "Notiz bleibt" });
      await expectDbError(db, "select public.applicant_move($1, 'chef')", [id], /Unbekannter Status/);
    });
  });
  it("Vertriebspartner dürfen nicht verschieben", async () => {
    await asUser(db, o.partner1, async () => {
      await expectDbError(db, "select public.applicant_move($1, 'neu')", [id], /Berechtigung/);
    });
  });
});
