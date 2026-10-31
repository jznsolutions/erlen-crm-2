"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fromDbError, type ActionResult } from "@/lib/actions";
import { pushProblem, sendTestPush, vapidKeys } from "@/lib/push";

export async function markAllRead(): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("notifications_mark_read", {});
  if (error) return fromDbError(error);
  revalidatePath("/", "layout");
  return { ok: true, message: "Alle Benachrichtigungen gelesen." };
}

export async function savePushSubscription(sub: { endpoint: string; p256dh: string; auth: string; userAgent: string }): Promise<ActionResult> {
  await requireUser();
  if (!/^https:\/\//.test(sub.endpoint) || sub.endpoint.length > 1000 || !sub.p256dh || !sub.auth) return { ok: false, error: "Ungültiges Gerät" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("push_subscribe", { p_endpoint: sub.endpoint, p_p256dh: sub.p256dh, p_auth: sub.auth, p_user_agent: sub.userAgent.slice(0, 300) });
  if (error) return fromDbError(error);
  return { ok: true, message: "Benachrichtigungen auf diesem Gerät aktiviert." };
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("push_unsubscribe", { p_endpoint: endpoint });
  if (error) return fromDbError(error);
  return { ok: true, message: "Benachrichtigungen auf diesem Gerät ausgeschaltet." };
}

export async function sendPushTest(): Promise<ActionResult> {
  const user = await requireUser();
  const sent = await sendTestPush(user.id);
  return sent ? { ok: true, message: "Test-Benachrichtigung verschickt – sie sollte gleich erscheinen." } : { ok: false, error: "Es ist kein Gerät für Benachrichtigungen registriert." };
}

export async function pushPublicKey(): Promise<{ key: string } | { error: string }> {
  await requireUser();
  const keys = await vapidKeys();
  if (keys) return { key: keys.publicKey };
  const problem = pushProblem();
  return {
    error:
      problem === "update_fehlt"
        ? "Push ist noch nicht freigeschaltet: Ein Administrator muss zuerst im Dashboard das „Datenbank-Update“ einspielen."
        : problem === "nicht_eingerichtet"
          ? "Push ist auf dem Server noch nicht eingerichtet (Supabase-Verbindung fehlt)."
          : "Push ist gerade nicht verfügbar. Bitte später erneut versuchen.",
  };
}

/** Abschluss-Gong für sich selbst stumm schalten oder wieder einschalten. */
export async function setGongMuted(muted: boolean): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("gong_mute_set", { p_muted: Boolean(muted) });
  if (error) return fromDbError(error);
  revalidatePath("/benachrichtigungen");
  return { ok: true, message: muted ? "Abschluss-Gong stumm geschaltet." : "Abschluss-Gong wieder an." };
}
