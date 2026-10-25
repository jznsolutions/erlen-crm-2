import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { close, connect, expectDbError, one, type Db } from "./helpers";
import { createOrg, type Org } from "./fixtures";

let db: Db;
let o: Org;

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
});
afterAll(async () => close(db));

/** Führt mehrere Schritte nacheinander als verschiedene Benutzer aus; alles wird am Ende verworfen. */
async function scenario(fn: () => Promise<void>) {
  await db.query("savepoint sc");
  try {
    await fn();
  } finally {
    await db.query("rollback to savepoint sc");
    await db.query("reset role");
  }
}
async function as(user: string) {
  await db.query("reset role");
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, role: "authenticated" })]);
}
async function confirmedSum(user: string) {
  await db.query("reset role");
  const r = await one<{ s: string | null }>(
    db,
    "select sum(quantity) s from public.performance_records where user_id = $1 and status = 'bestaetigt'",
    [user],
  );
  return Number(r.s ?? 0);
}
const create = async (user: string, qty = 1, ref: string | null = null, product?: string, confirmDup = false) =>
  (
    await one<{ id: string }>(db, "select public.performance_create($1, $2, current_date, $3, $4, null, true, $5) id", [
      user,
      product ?? o.product,
      qty,
      ref,
      confirmDup,
    ])
  ).id;

describe("Freigabeprozess", () => {
  it("Vertriebspartner reicht ein -> Status eingereicht, zählt noch nicht als bestätigt", async () => {
    await scenario(async () => {
      await as(o.partner1);
      const id = await create(o.partner1, 3);
      const r = await one<{ status: string; team_id: string }>(db, "select status, team_id from public.performance_records where id = $1", [id]);
      expect(r.status).toBe("eingereicht");
      expect(r.team_id).toBe(o.alpha);
      expect(await confirmedSum(o.partner1)).toBe(0);
    });
  });
  it("Teamleiter bestätigt -> zählt; Selbstbestätigung ist ausgeschlossen", async () => {
    await scenario(async () => {
      await as(o.partner1);
      const id = await create(o.partner1, 3);
      await expectDbError(db, "select public.performance_transition($1, 'bestaetigen')", [id], /Keine Berechtigung/);
      await as(o.teamleiterA);
      await db.query("select public.performance_transition($1, 'bestaetigen')", [id]);
      expect(await confirmedSum(o.partner1)).toBe(3);
      const appr = await one<{ n: string }>(db, "select count(*) n from public.performance_approvals where record_id = $1", [id]);
      expect(Number(appr.n)).toBe(1);
    });
  });
  it("Teamleiter kann eigene Leistung nicht selbst bestätigen", async () => {
    await scenario(async () => {
      await as(o.teamleiterA);
      const id = await create(o.teamleiterA, 1);
      const r = await one<{ status: string }>(db, "select status from public.performance_records where id = $1", [id]);
      expect(r.status).toBe("eingereicht");
      await expectDbError(db, "select public.performance_transition($1, 'bestaetigen')", [id], /Keine Berechtigung/);
    });
  });
  it("Erfassung durch Teamleiter für Teammitglied ist sofort bestätigt", async () => {
    await scenario(async () => {
      await as(o.teamleiterA);
      const id = await create(o.partner2, 2);
      const r = await one<{ status: string; confirmed_by: string }>(db, "select status, confirmed_by from public.performance_records where id = $1", [id]);
      expect(r.status).toBe("bestaetigt");
      expect(r.confirmed_by).toBe(o.teamleiterA);
    });
  });
  it("Ablehnung erfordert Begründung und benachrichtigt", async () => {
    await scenario(async () => {
      await as(o.partner1);
      const id = await create(o.partner1, 1);
      await as(o.teamleiterA);
      await expectDbError(db, "select public.performance_transition($1, 'ablehnen')", [id], /Begründung/);
      await db.query("select public.performance_transition($1, 'ablehnen', 'Vertrag unvollständig')", [id]);
      await db.query("reset role");
      const n = await one<{ n: string }>(db, "select count(*) n from public.notifications where user_id = $1 and type = 'leistung_abgelehnt'", [o.partner1]);
      expect(Number(n.n)).toBe(1);
    });
  });
  it("ungültige Werte werden abgelehnt (Menge, Zukunftsdatum, Pflicht-Vorgangs-ID)", async () => {
    await scenario(async () => {
      await as(o.partner1);
      await expectDbError(db, "select public.performance_create($1, $2, current_date, 0)", [o.partner1, o.product], /Menge/);
      await expectDbError(db, "select public.performance_create($1, $2, current_date + 5, 1)", [o.partner1, o.product], /Zukunft/);
      await expectDbError(db, "select public.performance_create($1, $2, current_date, 1)", [o.partner1, o.productRef], /Vorgangs-ID/);
    });
  });
});

describe("Szenario 7: Stornierte Leistungen werden korrekt berücksichtigt", () => {
  it("Storno einer bestätigten Leistung entfernt sie aus allen bestätigten Summen und Rankings", async () => {
    await scenario(async () => {
      await as(o.teamleiterA);
      const id = await create(o.partner1, 5);
      expect(await confirmedSum(o.partner1)).toBe(5);
      await as(o.teamleiterA);
      await expectDbError(db, "select public.performance_transition($1, 'stornieren')", [id], /Begründung/);
      await db.query("select public.performance_transition($1, 'stornieren', 'Kunde hat widerrufen')", [id]);
      expect(await confirmedSum(o.partner1)).toBe(0);
      await as(o.partner1);
      const board = await db.query("select * from public.get_leaderboard(current_date - 30, current_date)");
      expect(board.rows.find((r) => r.user_id === o.partner1)).toBeUndefined();
      await db.query("reset role");
      const adj = await one<{ n: string }>(db, "select count(*) n from public.performance_adjustments where record_id = $1 and action = 'storniert'", [id]);
      expect(Number(adj.n)).toBe(1);
    });
  });
  it("Korrektur ersetzt den Datensatz ohne Doppelzählung", async () => {
    await scenario(async () => {
      await as(o.teamleiterA);
      const id = await create(o.partner1, 5, "VG-100", o.productRef);
      const newId = (
        await one<{ id: string }>(db, "select public.performance_correct($1, $2, current_date, 3, 'Zählfehler') id", [id, o.productRef])
      ).id;
      expect(await confirmedSum(o.partner1)).toBe(3);
      const orig = await one<{ status: string }>(db, "select status from public.performance_records where id = $1", [id]);
      expect(orig.status).toBe("korrigiert");
      const repl = await one<{ corrects_record_id: string; external_ref: string }>(
        db, "select corrects_record_id, external_ref from public.performance_records where id = $1", [newId]);
      expect(repl.corrects_record_id).toBe(id);
      expect(repl.external_ref).toBe("VG-100");
    });
  });
  it("Vertriebspartner kann nicht stornieren oder korrigieren", async () => {
    await scenario(async () => {
      await as(o.teamleiterA);
      const id = await create(o.partner1, 2);
      await as(o.partner1);
      await expectDbError(db, "select public.performance_transition($1, 'stornieren', 'x')", [id], /Keine Berechtigung/);
      await expectDbError(db, "select public.performance_correct($1, $2, current_date, 9, 'x')", [id, o.product], /Keine Berechtigung/);
    });
  });
  it("bestätigte Leistungen können nicht als Entwurf bearbeitet oder gelöscht werden", async () => {
    await scenario(async () => {
      await as(o.teamleiterA);
      const id = await create(o.partner1, 2);
      await expectDbError(db, "select public.performance_update_draft($1, $2, current_date, 9)", [id, o.product], /Korrektur/);
      await expectDbError(db, "select public.performance_transition($1, 'loeschen')", [id], /Entwürfe/);
    });
  });
});

describe("Szenario 8: Doppelte Leistungserfassungen werden verhindert", () => {
  it("gleiche Vorgangs-ID je Produkt wird hart abgelehnt", async () => {
    await scenario(async () => {
      await as(o.partner1);
      await create(o.partner1, 1, "ABC-1", o.productRef);
      await expectDbError(
        db,
        "select public.performance_create($1, $2, current_date, 1, 'abc-1')",
        [o.partner2 === o.partner1 ? o.partner1 : o.partner1, o.productRef],
        /DUPLIKAT_REFERENZ/,
      );
    });
  });
  it("Vorgangs-ID ist auch über Mitarbeiter hinweg eindeutig", async () => {
    await scenario(async () => {
      await as(o.partner1);
      await create(o.partner1, 1, "XYZ-9", o.productRef);
      await as(o.partner2);
      await expectDbError(db, "select public.performance_create($1, $2, current_date, 1, 'XYZ-9')", [o.partner2, o.productRef], /DUPLIKAT_REFERENZ/);
    });
  });
  it("identische Erfassung ohne ID erzeugt Duplikatverdacht, bewusste Bestätigung ist möglich", async () => {
    await scenario(async () => {
      await as(o.partner1);
      await create(o.partner1, 2);
      await expectDbError(db, "select public.performance_create($1, $2, current_date, 2)", [o.partner1, o.product], /DUPLIKAT_VERDACHT/);
      await create(o.partner1, 2, null, undefined, true);
      await db.query("reset role");
      const n = await one<{ n: string }>(db, "select count(*) n from public.performance_records where user_id = $1", [o.partner1]);
      expect(Number(n.n)).toBe(2);
    });
  });
  it("nach Storno ist die Vorgangs-ID wieder verwendbar", async () => {
    await scenario(async () => {
      await as(o.teamleiterA);
      const id = await create(o.partner1, 1, "R-1", o.productRef);
      await db.query("select public.performance_transition($1, 'stornieren', 'Fehlerfassung')", [id]);
      await create(o.partner1, 1, "R-1", o.productRef);
    });
  });
});

describe("Ziele und Rankings", () => {
  it("Zielerreichung zählt nur bestätigte Leistungen und benachrichtigt einmalig", async () => {
    await scenario(async () => {
      await as(o.teamleiterA);
      await db.query(
        `select public.target_upsert(null, 'Monatsziel', 'mitarbeiter', $1, null, null, 'monat',
           date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, 4)`,
        [o.partner1],
      );
      await as(o.partner1);
      const pending = await create(o.partner1, 10);
      let p = await one<{ actual: string }>(db, "select actual from public.get_target_progress() where scope = 'mitarbeiter'");
      expect(Number(p.actual)).toBe(0);
      await as(o.teamleiterA);
      await db.query("select public.performance_transition($1, 'bestaetigen')", [pending]);
      await as(o.partner1);
      p = await one<{ actual: string }>(db, "select actual from public.get_target_progress() where scope = 'mitarbeiter'");
      expect(Number(p.actual)).toBe(10);
      await as(o.teamleiterA);
      await create(o.partner1, 1);
      await db.query("reset role");
      const n = await one<{ n: string }>(db, "select count(*) n from public.notifications where user_id = $1 and type = 'ziel_erreicht'", [o.partner1]);
      expect(Number(n.n)).toBe(1);
    });
  });
  it("Teamleiter darf keine Ziele für fremde Teams anlegen", async () => {
    await scenario(async () => {
      await as(o.teamleiterA);
      await expectDbError(
        db,
        "select public.target_upsert(null, 'X', 'team', null, $1, null, 'monat', current_date, current_date, 5)",
        [o.beta],
        /Keine Berechtigung/,
      );
      await expectDbError(
        db,
        "select public.target_upsert(null, 'X', 'agentur', null, null, null, 'monat', current_date, current_date, 5)",
        [],
        /Keine Berechtigung/,
      );
    });
  });
  it("Ranking-Sichtbarkeit je Rolle ist konfigurierbar", async () => {
    await scenario(async () => {
      await db.query(
        `update public.organization_settings set value = jsonb_set(value, '{agency_roles}', '["agenturleiter","admin"]') where key = 'rankings'`,
      );
      await as(o.partner1);
      await expectDbError(db, "select * from public.get_leaderboard(current_date - 7, current_date)", [], /nicht freigegeben/);
      await as(o.agenturleiter);
      await db.query("select * from public.get_leaderboard(current_date - 7, current_date)");
    });
  });
  it("Teamranking fremder Teams ist gesperrt", async () => {
    await scenario(async () => {
      await as(o.partner1);
      await db.query("select * from public.get_leaderboard(current_date - 7, current_date, null, $1)", [o.alpha]);
      await expectDbError(db, "select * from public.get_leaderboard(current_date - 7, current_date, null, $1)", [o.beta], /Keine Berechtigung/);
    });
  });
});
