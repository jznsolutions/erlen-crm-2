"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formToObject, fromDbError, fromZodError, type ActionResult } from "@/lib/actions";
import { checkbox, intRange, optionalText, optionalUuid, uuid } from "@/lib/validation";

const ok = (message: string, data?: Record<string, unknown>): ActionResult => {
  revalidatePath("/academy", "layout");
  revalidatePath("/admin/academy", "layout");
  return { ok: true, message, data };
};

export async function saveCourse(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("training.manage");
  const parsed = z.object({ id: optionalUuid, title: z.string().trim().min(2).max(160), description: optionalText(2000), status: z.enum(["entwurf", "veroeffentlicht", "archiviert"]), sort_order: intRange(0, 1000).default(0) }).safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("course_upsert", { p_id: d.id as string, p_title: d.title, p_description: d.description as string, p_status: d.status, p_sort_order: d.sort_order });
  return error ? fromDbError(error) : ok("Kurs gespeichert.", { id: data });
}

export async function deleteCourse(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("training.manage");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Ungültig" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("course_delete", { p_id: id.data });
  return error ? fromDbError(error) : ok("Kurs gelöscht.");
}

export async function saveModule(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("training.manage");
  const parsed = z.object({ id: optionalUuid, course_id: uuid, title: z.string().trim().min(2).max(160), description: optionalText(1000), sort_order: intRange(0, 1000).default(0) }).safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("module_upsert", { p_id: d.id as string, p_course: d.course_id, p_title: d.title, p_description: d.description as string, p_sort_order: d.sort_order });
  return error ? fromDbError(error) : ok("Modul gespeichert.");
}

export async function deleteModule(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("training.manage");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Ungültig" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("module_delete", { p_id: id.data });
  return error ? fromDbError(error) : ok("Modul gelöscht.");
}

const lessonSchema = z.object({
  id: optionalUuid,
  module_id: uuid,
  title: z.string().trim().min(2).max(160),
  lesson_type: z.enum(["text", "video", "dokument", "quiz"]),
  content: z.string().max(50000).optional(),
  video_url: z.union([z.url({ protocol: /^https$/, message: "Nur https-Links" }), z.literal("")]).optional(),
  duration_minutes: z.coerce.number().int().min(0).max(600).optional(),
  min_seconds: intRange(0, 3600).default(30),
  sort_order: intRange(0, 1000).default(0),
  is_published: checkbox,
});

export async function saveLesson(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("training.manage");
  const parsed = lessonSchema.safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lesson_upsert", {
    p_id: d.id as string, p_module: d.module_id, p_title: d.title, p_type: d.lesson_type, p_content: (d.content ?? null) as string,
    p_video_url: (d.video_url || null) as string, p_duration_minutes: (d.duration_minutes ?? null) as number, p_min_seconds: d.min_seconds,
    p_sort_order: d.sort_order, p_is_published: d.is_published,
  });
  return error ? fromDbError(error) : ok("Lektion gespeichert.", { id: data });
}

export async function deleteLesson(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("training.manage");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Ungültig" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("lesson_delete", { p_id: id.data });
  return error ? fromDbError(error) : ok("Lektion gelöscht.");
}

export async function setLessonMedia(lessonId: string, kind: "video" | "dokument", path: string | null): Promise<ActionResult> {
  await requirePermission("training.manage");
  if (!uuid.safeParse(lessonId).success) return { ok: false, error: "Ungültig" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("lesson_set_media", { p_lesson: lessonId, p_kind: kind, p_path: path as string });
  return error ? fromDbError(error) : ok(path ? "Datei hinterlegt." : "Datei entfernt.");
}

export async function setCourseCover(courseId: string, path: string | null): Promise<ActionResult> {
  await requirePermission("training.manage");
  if (!uuid.safeParse(courseId).success) return { ok: false, error: "Ungültig" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("course_set_cover", { p_course: courseId, p_path: path as string });
  return error ? fromDbError(error) : ok("Titelbild gespeichert.");
}

const quizSchema = z.object({
  lesson_id: uuid,
  pass_percent: intRange(1, 100),
  max_attempts: z.number().int().min(1).max(50).nullable(),
  questions: z.array(z.object({
    question: z.string().trim().min(3, "Frage zu kurz").max(1000),
    allows_multiple: z.boolean(),
    answers: z.array(z.object({ answer: z.string().trim().min(1).max(500), is_correct: z.boolean() })).min(2, "Mindestens zwei Antworten").max(10),
  })).min(1, "Mindestens eine Frage").max(50),
});

export async function saveQuiz(input: z.infer<typeof quizSchema>): Promise<ActionResult> {
  await requirePermission("training.manage");
  const parsed = quizSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("quiz_save", { p_lesson: d.lesson_id, p_pass_percent: d.pass_percent, p_max_attempts: d.max_attempts as number, p_questions: d.questions });
  return error ? fromDbError(error) : ok("Quiz gespeichert.");
}

export async function setCourseAccess(courseId: string, entries: { role_id?: string; team_id?: string; user_id?: string; is_mandatory: boolean }[]): Promise<ActionResult> {
  await requirePermission("training.manage");
  const parsed = z.object({ id: uuid, entries: z.array(z.object({ role_id: z.uuid().optional(), team_id: z.uuid().optional(), user_id: z.uuid().optional(), is_mandatory: z.boolean() })).max(500) }).safeParse({ id: courseId, entries });
  if (!parsed.success) return { ok: false, error: "Ungültige Freigaben" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("course_set_access", { p_course: parsed.data.id, p_entries: parsed.data.entries });
  return error ? fromDbError(error) : ok("Freigaben gespeichert. Pflichtschulungen wurden zugewiesen.");
}

export async function assignCourse(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("training.manage", "training.progress.manage");
  const parsed = z.object({ course_id: uuid, user_id: uuid, due_on: z.string().optional() }).safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("course_assign", { p_course: parsed.data.course_id, p_user: parsed.data.user_id, p_due_on: (parsed.data.due_on || null) as string });
  return error ? fromDbError(error) : ok("Kurs zugewiesen.");
}
