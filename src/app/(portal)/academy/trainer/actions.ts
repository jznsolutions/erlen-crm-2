"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProducts, getSetting } from "@/lib/queries";
import { customerReply, DIFFICULTIES, SCENARIOS, trainerAvailable, trainingFeedback, type TrainerFeedback, type TrainerReply } from "@/lib/sales-trainer";

const input = z.object({
  scenario: z.enum(Object.keys(SCENARIOS) as [keyof typeof SCENARIOS, ...(keyof typeof SCENARIOS)[]]),
  difficulty: z.enum(Object.keys(DIFFICULTIES) as [keyof typeof DIFFICULTIES, ...(keyof typeof DIFFICULTIES)[]]),
  turns: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(1200) }))
    .min(1)
    .max(40)
    // Gesprächsverlauf muss mit dem Verkäufer beginnen und abwechseln
    .refine((t) => t.every((m, i) => m.role === (i % 2 === 0 ? "user" : "assistant")), "Ungültiger Gesprächsverlauf"),
});

/** Begrenzung je Person (Kostenschutz): max. 120 KI-Anfragen pro Stunde. */
async function withinLimit(userId: string) {
  const { data } = await createAdminClient().rpc("rate_limit_hit", { p_key: `trainer:${userId}`, p_window_seconds: 3600, p_max: 120 });
  return data !== false;
}

export async function trainerSay(raw: unknown): Promise<TrainerReply> {
  const user = await requirePermission("training.read");
  if (!trainerAvailable()) return { ok: false, error: "Der KI-Trainer ist noch nicht eingerichtet." };
  const parsed = input.safeParse(raw);
  if (!parsed.success || parsed.data.turns.at(-1)?.role !== "user") return { ok: false, error: "Ungültige Nachricht." };
  if (!(await withinLimit(user.id))) return { ok: false, error: "Du hast in dieser Stunde schon sehr viel trainiert – mach kurz Pause und versuch es später erneut." };
  const [products, agency] = await Promise.all([getProducts(), getSetting<{ name: string }>("agency")]);
  return customerReply(parsed.data.scenario, parsed.data.difficulty, parsed.data.turns, agency?.name ?? "ERLEN Vertriebsagentur", products.map((p) => p.name));
}

export async function trainerFinish(raw: unknown): Promise<{ ok: true; feedback: TrainerFeedback } | { ok: false; error: string }> {
  const user = await requirePermission("training.read");
  if (!trainerAvailable()) return { ok: false, error: "Der KI-Trainer ist noch nicht eingerichtet." };
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Ungültiger Gesprächsverlauf." };
  if (parsed.data.turns.filter((t) => t.role === "user").length < 2) return { ok: false, error: "Führe das Gespräch noch etwas weiter (mindestens zwei Nachrichten), dann gibt es eine Bewertung." };
  if (!(await withinLimit(user.id))) return { ok: false, error: "Du hast in dieser Stunde schon sehr viel trainiert – versuch es später erneut." };
  const r = await trainingFeedback(parsed.data.scenario, parsed.data.difficulty, parsed.data.turns);
  if (!r.ok) return r;
  const supabase = await createClient();
  const { error } = await supabase.rpc("sales_training_save", {
    p_scenario: parsed.data.scenario,
    p_difficulty: parsed.data.difficulty,
    p_score: Math.max(0, Math.min(100, Math.round(r.feedback.score))),
    p_outcome: r.feedback.outcome,
    p_turns: parsed.data.turns.length,
    p_feedback: r.feedback,
  });
  if (error) console.error("[trainer] speichern", error.message);
  revalidatePath("/academy/trainer");
  return r;
}
