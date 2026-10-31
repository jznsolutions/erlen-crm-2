import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { close, connect, one, type Db } from "./helpers";
import { createOrg, type Org } from "./fixtures";

let db: Db;
let o: Org;

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
});
afterAll(async () => close(db));

let n = 0;
const doc = async (user: string, category: string, days: number | null, status = "geprueft") => {
  const path = `${user}/doc-${++n}.pdf`;
  await db.query("insert into storage.objects (bucket_id, name) values ('employee-docs', $1)", [path]);
  return (await one<{ id: string }>(db,
    "insert into public.employee_documents (user_id, category, storage_path, file_name, mime_type, size_bytes, valid_until, status) values ($1, $2, $3, 'a.pdf', 'application/pdf', 10, case when $4::int is null then null else private.today_berlin() + $4::int end, $5) returning id",
    [user, category, path, days, status])).id;
};
const watch = async () => (await one<{ n: number }>(db, "select public.document_expiry_watch() n")).n;
const notes = async (user: string) => (await db.query("select title from public.notifications where user_id = $1 and type = 'unterlage_ablauf' order by created_at, title", [user])).rows.map((r) => r.title);

describe("Erinnerung an ablaufende Unterlagen", () => {
  it("30 Tage vorher und nach Ablauf, jeweils einmal, an Person und Verwaltung", async () => {
    await doc(o.partner1, "fuehrerschein", 20);
    await doc(o.partner2, "personalausweis", -1);
    await doc(o.partner3, "gewerbeanmeldung", 60);
    await doc(o.partner3, "steuer", null);
    await doc(o.partner4, "vertrag", -5, "abgelehnt");
    expect(await watch()).toBe(2);
    expect(await notes(o.partner1)).toEqual(["Führerschein läuft bald ab"]);
    expect(await notes(o.partner2)).toEqual(["Personalausweis ist abgelaufen"]);
    expect(await notes(o.partner3)).toEqual([]);
    expect((await notes(o.agenturleiter)).sort()).toEqual([
      expect.stringContaining("Abgelaufen: Personalausweis"),
      expect.stringContaining("Läuft bald ab: Führerschein"),
    ].sort());
    expect(await watch()).toBe(0);
    // Nach Ablauf folgt die zweite Erinnerung
    await db.query("update public.employee_documents set valid_until = private.today_berlin() - 1 where user_id = $1", [o.partner1]);
    expect(await watch()).toBe(1);
    expect(await notes(o.partner1)).toContain("Führerschein ist abgelaufen");
  });

  it("keine Erinnerung, wenn schon eine neuere Version hochgeladen ist", async () => {
    await doc(o.partner4, "fuehrerschein", 10);
    await doc(o.partner4, "fuehrerschein", 3000, "eingereicht");
    expect(await watch()).toBe(0);
  });

  it("nur der Server darf die Prüfung auslösen", async () => {
    expect((await one<{ ok: boolean }>(db, "select has_function_privilege('authenticated', 'public.document_expiry_watch()', 'execute') ok")).ok).toBe(false);
  });
});
