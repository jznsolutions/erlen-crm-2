import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, close, connect, expectDbError, one, type Db } from "./helpers";
import { createOrg, type Org } from "./fixtures";

let db: Db;
let o: Org;

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
});
afterAll(async () => close(db));

describe("Profilbild durch die Verwaltung", () => {
  it("Agenturleitung darf in den Ordner einer Person hochladen und das Bild setzen", async () => {
    const path = `${o.partner1}/avatar-1.png`;
    await asUser(db, o.agenturleiter, async () => {
      await db.query("insert into storage.objects (bucket_id, name) values ('avatars', $1)", [path]);
      await db.query("select public.admin_set_avatar($1, $2)", [o.partner1, path]);
      expect(await one(db, "select avatar_path from public.profiles where id = $1", [o.partner1])).toEqual({ avatar_path: path });
      await expectDbError(db, "select public.admin_set_avatar($1, $2)", [o.partner1, `${o.partner2}/x.png`], /Ungültiger Dateipfad/);
      await db.query("select public.admin_set_avatar($1, null)", [o.partner1]);
      expect(await one(db, "select avatar_path from public.profiles where id = $1", [o.partner1])).toEqual({ avatar_path: null });
    });
  });

  it("Vertriebspartner dürfen nur in den eigenen Ordner und keine fremden Bilder setzen", async () => {
    await asUser(db, o.partner2, async () => {
      await expectDbError(db, "insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${o.partner1}/fremd.png`], /row-level security/);
      await db.query("insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${o.partner2}/eigen.png`]);
      await expectDbError(db, "select public.admin_set_avatar($1, null)", [o.partner1], /Berechtigung/);
    });
  });
});
