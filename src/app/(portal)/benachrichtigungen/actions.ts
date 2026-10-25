"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fromDbError, type ActionResult } from "@/lib/actions";

export async function markAllRead(): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("notifications_mark_read", {});
  if (error) return fromDbError(error);
  revalidatePath("/", "layout");
  return { ok: true, message: "Alle Benachrichtigungen gelesen." };
}
