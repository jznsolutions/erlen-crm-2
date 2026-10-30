import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { secretKey } from "@/lib/env.server";
import { isPortalConfigured } from "@/lib/env";
import { SITE } from "@/lib/site";

// Push-Benachrichtigungen (Web Push). Das Schlüsselpaar wird beim ersten Gebrauch erzeugt
// und in der Datenbank abgelegt – keine Einrichtung in Vercel nötig.

let cached: { publicKey: string; privateKey: string } | null = null;

export function pushAvailable() {
  return isPortalConfigured() && Boolean(secretKey());
}

/** Grund, warum Push gerade nicht verfügbar ist (für eine verständliche Meldung). */
export type PushProblem = "nicht_eingerichtet" | "update_fehlt" | "fehler";
let lastProblem: PushProblem | null = null;
export const pushProblem = () => lastProblem;

export async function vapidKeys(): Promise<{ publicKey: string; privateKey: string } | null> {
  if (cached) return cached;
  if (!pushAvailable()) {
    lastProblem = "nicht_eingerichtet";
    return null;
  }
  const admin = createAdminClient();
  let { data, error } = await admin.rpc("push_vapid_keys", {});
  if (!error && !data?.[0]?.public_key) {
    const k = webpush.generateVAPIDKeys();
    ({ data, error } = await admin.rpc("push_vapid_keys", { p_public: k.publicKey, p_private: k.privateKey }));
  }
  if (error) {
    // Funktion fehlt = Datenbank-Update (Migration 1100) noch nicht eingespielt
    lastProblem = error.code === "PGRST202" || error.code === "42883" || /function|schema cache/i.test(error.message) ? "update_fehlt" : "fehler";
    console.error("[push] Schlüssel", error.code, error.message);
    return null;
  }
  const row = data?.[0];
  if (!row?.public_key || !row.private_key) return null;
  cached = { publicKey: row.public_key, privateKey: row.private_key };
  return cached;
}

type Payload = { title: string; body?: string | null; url: string; tag?: string };

async function sendTo(subs: { id: string; endpoint: string; p256dh: string; auth: string }[], payload: Payload) {
  const keys = await vapidKeys();
  if (!keys || subs.length === 0) return 0;
  const admin = createAdminClient();
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { vapidDetails: { subject: `mailto:${SITE.email ?? "kontakt@erlen-sales.de"}`, publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 60 * 60 * 24 },
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // Abgemeldete oder abgelaufene Geräte entfernen
        if (status === 404 || status === 410) await admin.rpc("push_subscription_remove", { p_id: s.id });
        else console.error("[push]", status, (e as Error).message);
      }
    }),
  );
  return sent;
}

/** Verschickt alle noch nicht zugestellten Benachrichtigungen als Push. */
export async function deliverPendingPush(): Promise<number> {
  if (!pushAvailable()) return 0;
  const admin = createAdminClient();
  const { data: pending, error } = await admin.rpc("push_claim_pending", {});
  if (error) throw new Error(error.message);
  if (!pending?.length) return 0;
  const { data: subs } = await admin.rpc("push_subscriptions_for", { p_users: [...new Set(pending.map((p) => p.user_id))] });
  let sent = 0;
  for (const n of pending) {
    const mine = (subs ?? []).filter((s) => s.user_id === n.user_id);
    // Antippen öffnet das Ziel und markiert die Benachrichtigung als gelesen
    sent += await sendTo(mine, { title: n.title, body: n.body, url: `/benachrichtigungen/${n.notification_id}`, tag: n.notification_id });
  }
  return sent;
}

/** Test-Benachrichtigung an alle Geräte eines Benutzers. */
export async function sendTestPush(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { data: subs } = await admin.rpc("push_subscriptions_for", { p_users: [userId] });
  return sendTo(subs ?? [], { title: "ERLEN: Benachrichtigungen aktiv ✓", body: "So sehen deine Benachrichtigungen ab jetzt aus.", url: "/benachrichtigungen", tag: "test" });
}
