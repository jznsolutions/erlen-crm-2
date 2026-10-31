import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";

async function clientKey(prefix: string) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unbekannt";
  return `${prefix}:${createHash("sha256").update(ip + serverEnv().RATE_LIMIT_SALT).digest("hex").slice(0, 32)}`;
}

/** Einfache Begrenzung von Versuchen je Herkunft (IP, gehasht). */
export async function allowed(prefix: string, max: number, windowSeconds = 900) {
  const { data } = await createAdminClient().rpc("rate_limit_hit", {
    p_key: await clientKey(prefix),
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  return data !== false;
}
