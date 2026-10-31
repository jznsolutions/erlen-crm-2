import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, asUserKeep, close, connect, expectDbError, type Db } from "./helpers";
import { createOrg, type Org } from "./fixtures";

let db: Db;
let o: Org;

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
});
afterAll(async () => close(db));

const save = (score = 70) => db.query("select public.sales_training_save('glasfaser', 'mittel', $1, 'termin', 6, '{\"summary\": \"ok\"}'::jsonb)", [score]);

describe("KI-Verkaufstrainer: Ergebnisse", () => {
  it("speichert nur für sich selbst und prüft Werte", async () => {
    await asUserKeep(db, o.partner1, async () => save(70));
    await asUser(db, o.partner1, async () => {
      await expectDbError(db, "select public.sales_training_save('mond', 'mittel', 50, 'termin', 2, '{}'::jsonb)", [], /check constraint|violates/);
      await expectDbError(db, "select public.sales_training_save('glasfaser', 'mittel', 150, 'termin', 2, '{}'::jsonb)", [], /check constraint|violates/);
    });
  });
  it("Ausbilder sieht Ergebnisse seiner Auszubildenden, andere Partner nicht", async () => {
    await asUser(db, o.ausbilder, async () => {
      expect((await db.query("select score from public.sales_trainings where user_id = $1", [o.partner1])).rows).toEqual([{ score: 70 }]);
    });
    await asUser(db, o.partner2, async () => {
      expect((await db.query("select 1 from public.sales_trainings where user_id = $1", [o.partner1])).rows).toHaveLength(0);
    });
  });
});
