"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fromDbError, type ActionResult } from "@/lib/actions";
import { uuid } from "@/lib/validation";

export async function startLesson(lessonId: string): Promise<void> {
  await requireUser();
  if (!uuid.safeParse(lessonId).success) return;
  const supabase = await createClient();
  await supabase.rpc("lesson_start", { p_lesson: lessonId });
}

export async function completeLesson(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = uuid.safeParse(fd.get("lesson_id"));
  if (!id.success) return { ok: false, error: "Ungültige Lektion" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("lesson_complete", { p_lesson: id.data });
  if (error) return fromDbError(error);
  revalidatePath("/academy", "layout");
  return { ok: true, message: "Lektion abgeschlossen." };
}

export async function reportVideoProgress(lessonId: string, position: number, duration: number): Promise<string | null> {
  await requireUser();
  const parsed = z.object({ id: uuid, p: z.number().int().min(0).max(86400), d: z.number().int().min(1).max(86400) }).safeParse({ id: lessonId, p: Math.floor(position), d: Math.floor(duration) });
  if (!parsed.success) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("lesson_video_progress", { p_lesson: parsed.data.id, p_position: parsed.data.p, p_duration: parsed.data.d });
  if (data === "abgeschlossen") revalidatePath("/academy", "layout");
  return data ?? null;
}

export async function submitQuiz(lessonId: string, answers: Record<string, string[]>): Promise<ActionResult> {
  await requireUser();
  const parsed = z.object({ id: uuid, answers: z.record(z.uuid(), z.array(z.uuid()).max(20)) }).safeParse({ id: lessonId, answers });
  if (!parsed.success) return { ok: false, error: "Ungültige Antworten" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_quiz", { p_lesson: parsed.data.id, p_answers: parsed.data.answers });
  if (error) return fromDbError(error);
  revalidatePath("/academy", "layout");
  return { ok: true, data: data as Record<string, unknown> };
}
