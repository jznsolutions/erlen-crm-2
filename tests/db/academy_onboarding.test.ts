import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { close, connect, expectDbError, one, type Db } from "./helpers";
import { createOrg, type Org } from "./fixtures";

let db: Db;
let o: Org;
let course: string;
let textLesson: string;
let quizLesson: string;
let videoLesson: string;

async function as(user: string) {
  await db.query("reset role");
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, role: "authenticated" })]);
}
async function scenario(fn: () => Promise<void>) {
  await db.query("savepoint sc");
  try {
    await fn();
  } finally {
    await db.query("reset role");
    await db.query("rollback to savepoint sc");
  }
}
const progress = async (user: string, lesson: string) => {
  await db.query("reset role");
  return (
    await one<{ status: string } | undefined>(db, "select status from public.lesson_progress where user_id = $1 and lesson_id = $2", [user, lesson])
  )?.status;
};

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
  await as(o.agenturleiter);
  course = (await one<{ id: string }>(db, "select public.course_upsert(null, 'Grundlagen Vertrieb', 'Einstieg', 'veroeffentlicht') id")).id;
  const mod = (await one<{ id: string }>(db, "select public.module_upsert(null, $1, 'Modul 1', null, 1) id", [course])).id;
  textLesson = (
    await one<{ id: string }>(db, "select public.lesson_upsert(null, $1, 'Einführung', 'text', 'Hallo', null, 5, 30, 1, true) id", [mod])
  ).id;
  videoLesson = (
    await one<{ id: string }>(db, "select public.lesson_upsert(null, $1, 'Video', 'video', null, null, 5, 0, 2, true) id", [mod])
  ).id;
  quizLesson = (
    await one<{ id: string }>(db, "select public.lesson_upsert(null, $1, 'Test', 'quiz', null, null, 5, 0, 3, true) id", [mod])
  ).id;
  await db.query(
    `select public.quiz_save($1, 100, null, $2::jsonb)`,
    [
      quizLesson,
      JSON.stringify([
        { question: "2+2?", answers: [{ answer: "4", is_correct: true }, { answer: "5", is_correct: false }] },
        { question: "Hauptstadt?", answers: [{ answer: "Berlin", is_correct: true }, { answer: "Paris", is_correct: false }] },
      ]),
    ],
  );
  // Pflichtschulung für alle Vertriebspartner
  await db.query(
    `select public.course_set_access($1, jsonb_build_array(jsonb_build_object('role_id',
       (select id from public.roles where key = 'vertriebspartner'), 'is_mandatory', true)))`,
    [course],
  );
  await db.query("reset role");
});
afterAll(async () => close(db));

describe("Academy: Kursfreigabe", () => {
  it("Pflichtschulung wird Vertriebspartnern automatisch zugewiesen und gemeldet", async () => {
    const a = await one<{ n: string }>(db, "select count(*) n from public.course_assignments where course_id = $1 and user_id = $2", [course, o.partner1]);
    expect(Number(a.n)).toBe(1);
    const n = await one<{ n: string }>(db, "select count(*) n from public.notifications where user_id = $1 and type = 'schulung_zugewiesen'", [o.partner1]);
    expect(Number(n.n)).toBe(1);
  });
  it("Teamleiter (nicht freigegeben) sieht den Kurs nicht", async () => {
    await scenario(async () => {
      await as(o.teamleiterB);
      const r = await db.query("select id from public.courses");
      expect(r.rows).toHaveLength(0);
    });
  });
  it("Entwurfskurse sind für Lernende unsichtbar", async () => {
    await scenario(async () => {
      await db.query("update public.courses set status = 'entwurf' where id = $1", [course]);
      await as(o.partner1);
      expect((await db.query("select id from public.courses")).rows).toHaveLength(0);
      expect((await db.query("select id from public.lessons")).rows).toHaveLength(0);
    });
  });
});

describe("Academy: Lernfortschritt", () => {
  it("Öffnen setzt nur 'in_bearbeitung' – kein Abschluss durch bloßes Öffnen", async () => {
    await scenario(async () => {
      await as(o.partner1);
      await db.query("select public.lesson_start($1)", [textLesson]);
      expect(await progress(o.partner1, textLesson)).toBe("in_bearbeitung");
    });
  });
  it("Text-Lektion: Abschluss erst nach Mindestzeit und ausdrücklicher Bestätigung", async () => {
    await scenario(async () => {
      await as(o.partner1);
      await expectDbError(db, "select public.lesson_complete($1)", [textLesson], /zuerst/);
      await db.query("select public.lesson_start($1)", [textLesson]);
      await expectDbError(db, "select public.lesson_complete($1)", [textLesson], /MINDESTZEIT/);
      await db.query("reset role");
      await db.query("update public.lesson_progress set started_at = now() - interval '5 minutes' where user_id = $1", [o.partner1]);
      await as(o.partner1);
      await db.query("select public.lesson_complete($1)", [textLesson]);
      expect(await progress(o.partner1, textLesson)).toBe("abgeschlossen");
    });
  });
  it("Video-Lektion: Abschluss erst ab 90 % und plausibler Echtzeit", async () => {
    await scenario(async () => {
      await as(o.partner1);
      await db.query("select public.lesson_video_progress($1, 100, 600)", [videoLesson]);
      expect(await progress(o.partner1, videoLesson)).toBe("in_bearbeitung");
      await as(o.partner1);
      await db.query("select public.lesson_video_progress($1, 590, 600)", [videoLesson]);
      expect(await progress(o.partner1, videoLesson)).toBe("in_bearbeitung"); // zu schnell
      await db.query("update public.lesson_progress set started_at = now() - interval '10 minutes' where user_id = $1", [o.partner1]);
      await as(o.partner1);
      await db.query("select public.lesson_video_progress($1, 590, 600)", [videoLesson]);
      expect(await progress(o.partner1, videoLesson)).toBe("abgeschlossen");
    });
  });
  it("Quiz: Lösungen werden nicht ausgeliefert; Abschluss nur bei Bestehen", async () => {
    await scenario(async () => {
      await as(o.partner1);
      const quiz = (await one<{ q: { questions: { id: string; answers: { id: string; is_correct?: boolean }[] }[] } }>(
        db, "select public.get_quiz($1) q", [quizLesson])).q;
      expect(JSON.stringify(quiz)).not.toContain("is_correct");
      await db.query("reset role");
      const correct = await db.query(
        "select q.id qid, a.id aid, a.is_correct from public.quiz_questions q join public.quiz_answers a on a.question_id = q.id",
      );
      const right: Record<string, string[]> = {};
      const wrong: Record<string, string[]> = {};
      for (const r of correct.rows) (r.is_correct ? right : wrong)[r.qid] = [r.aid];

      await as(o.partner1);
      const fail = (await one<{ r: { passed: boolean } }>(db, "select public.submit_quiz($1, $2) r", [quizLesson, JSON.stringify(wrong)])).r;
      expect(fail.passed).toBe(false);
      expect(await progress(o.partner1, quizLesson)).toBe("in_bearbeitung");
      await as(o.partner1);
      const pass = (await one<{ r: { passed: boolean; score_percent: number } }>(db, "select public.submit_quiz($1, $2) r", [quizLesson, JSON.stringify(right)])).r;
      expect(pass.passed).toBe(true);
      expect(pass.score_percent).toBe(100);
      expect(await progress(o.partner1, quizLesson)).toBe("abgeschlossen");
    });
  });
  it("Ausbilder dokumentiert Fortschritt nur für Zugewiesene; Teamleiter sieht Teamfortschritt", async () => {
    await scenario(async () => {
      await as(o.ausbilder);
      await db.query("select public.trainer_set_lesson_progress($1, $2, 'abgeschlossen', 'Praxis geprüft')", [o.partner1, textLesson]);
      await expectDbError(db, "select public.trainer_set_lesson_progress($1, $2, 'abgeschlossen')", [o.partner2, textLesson], /Keine Berechtigung/);
      await as(o.teamleiterA);
      const ov = await db.query("select * from public.get_training_overview($1)", [o.partner1]);
      expect(Number(ov.rows[0].completed_lessons)).toBe(1);
      expect(Number(ov.rows[0].total_lessons)).toBe(3);
      await as(o.teamleiterB);
      await expectDbError(db, "select * from public.get_training_overview($1)", [o.partner1], /Keine Berechtigung/);
    });
  });
  it("Lernende können fremden Fortschritt nicht lesen", async () => {
    await scenario(async () => {
      await db.query(
        "insert into public.lesson_progress (user_id, lesson_id, status) values ($1, $2, 'abgeschlossen')",
        [o.partner2, textLesson],
      );
      await as(o.partner1);
      expect((await db.query("select * from public.lesson_progress")).rows).toHaveLength(0);
    });
  });
});

describe("Onboarding: Einladungen", () => {
  const createInvitation = async (hash: string, email: string, hours = 72) => {
    await as(o.admin);
    const id = (
      await one<{ id: string }>(
        db,
        "select public.invitation_create($1, 'Erika', 'Neu', 'vertriebspartner', $2, $3, $4, $5, $6) id",
        [email, o.alpha, o.teamleiterA, o.ausbilder, hash, hours],
      )
    ).id;
    await db.query("reset role");
    return id;
  };
  const signUp = (id: string, email: string, invitationId: string | null) =>
    db.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '', now(), $3::jsonb, '{}'::jsonb, now(), now())`,
      [id, email, JSON.stringify(invitationId ? { invitation_id: invitationId } : {})],
    );

  it("gültige Einladung legt aktives Profil mit Rolle, Team, Vorgesetztem, Ausbilder und Pflichtschulung an", async () => {
    await scenario(async () => {
      const inv = await createInvitation("c".repeat(64), "erika@test.erlen.local");
      const uid = randomUUID();
      await signUp(uid, "erika@test.erlen.local", inv);
      const p = await one<{ status: string; role: string }>(
        db, "select p.status, r.key role from public.profiles p join public.roles r on r.id = p.role_id where p.id = $1", [uid]);
      expect(p).toEqual({ status: "aktiv", role: "vertriebspartner" });
      const team = await one<{ team_id: string }>(db, "select team_id from public.team_memberships where user_id = $1", [uid]);
      expect(team.team_id).toBe(o.alpha);
      const rel = await db.query("select relation_type from public.reporting_relationships where employee_id = $1 order by 1", [uid]);
      expect(rel.rows.map((r) => r.relation_type).sort()).toEqual(["ausbilder", "vorgesetzter"]);
      const ca = await one<{ n: string }>(db, "select count(*) n from public.course_assignments where user_id = $1", [uid]);
      expect(Number(ca.n)).toBe(1);
    });
  });
  it("Einladung ist nur einmal verwendbar", async () => {
    await scenario(async () => {
      const inv = await createInvitation("d".repeat(64), "einmal@test.erlen.local");
      await signUp(randomUUID(), "einmal@test.erlen.local", inv);
      await expectDbError(db,
        `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, created_at, updated_at)
         values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'anders@test.erlen.local', '', $2::jsonb, now(), now())`,
        [randomUUID(), JSON.stringify({ invitation_id: inv })], /ungültig, abgelaufen/);
    });
  });
  it("abgelaufene oder widerrufene Einladungen werden abgelehnt", async () => {
    await scenario(async () => {
      const inv = await createInvitation("e".repeat(64), "alt@test.erlen.local");
      await db.query("update public.invitations set expires_at = now() - interval '1 minute' where id = $1", [inv]);
      await expectDbError(db,
        `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, created_at, updated_at)
         values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alt@test.erlen.local', '', $2::jsonb, now(), now())`,
        [randomUUID(), JSON.stringify({ invitation_id: inv })], /abgelaufen/);
      const lookup = await db.query("select * from public.invitation_lookup($1)", ["e".repeat(64)]);
      expect(lookup.rows).toHaveLength(0);
    });
  });
  it("Konten ohne Einladung entstehen deaktiviert und ohne Rechte", async () => {
    await scenario(async () => {
      const uid = randomUUID();
      await signUp(uid, "fremd@test.erlen.local", null);
      const p = await one<{ status: string }>(db, "select status from public.profiles where id = $1", [uid]);
      expect(p.status).toBe("deaktiviert");
    });
  });
  it("Token-Hashes erscheinen nicht im Audit-Log", async () => {
    await scenario(async () => {
      await createInvitation("f".repeat(64), "audit@test.erlen.local");
      const r = await db.query("select new_data from public.audit_logs where table_name = 'invitations'");
      expect(JSON.stringify(r.rows)).not.toContain("f".repeat(64));
    });
  });
});
