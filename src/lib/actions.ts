import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";

export type ActionResult =
  | { ok: true; message?: string; data?: Record<string, unknown> }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string> };

export const initialActionState: ActionResult | null = null;

// Fehlercodes, deren Meldungen bewusst für Endnutzer formuliert sind
const USER_FACING_CODES = new Set(["P0001", "42501", "23505", "23514", "22023"]);

/**
 * Übersetzt Datenbankfehler in sichere Meldungen. Interne Details (SQL, Tabellennamen)
 * werden nur serverseitig protokolliert, nie an den Browser gesendet.
 */
export function fromDbError(error: PostgrestError | { message: string; code?: string } | null): ActionResult {
  if (!error) return { ok: false, error: "Unbekannter Fehler" };
  const code = error.code ?? "";
  const raw = error.message ?? "";
  const tagged = raw.match(/^([A-Z_]+):\s*(.*)$/);
  if (tagged) return { ok: false, code: tagged[1], error: tagged[2] };
  if (code === "42501") {
    const msg = raw.startsWith("permission denied") ? "Keine Berechtigung für diese Aktion." : raw.replace(/\s*\([a-z_.]+\)$/, "");
    return { ok: false, code, error: msg };
  }
  if (code === "23505") return { ok: false, code, error: "Dieser Eintrag existiert bereits." };
  if (code === "23514") return { ok: false, code, error: "Die Eingabe ist ungültig. Bitte prüfe die Felder." };
  if (USER_FACING_CODES.has(code)) return { ok: false, code, error: raw };
  console.error("[db-error]", code, raw);
  return { ok: false, error: "Die Aktion konnte nicht ausgeführt werden. Bitte versuche es erneut." };
}

export function fromZodError(error: z.ZodError): ActionResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, error: "Bitte prüfe die markierten Felder.", fieldErrors };
}

/** FormData -> Objekt (leere Strings werden zu undefined) */
export function formToObject(fd: FormData): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const all = fd.getAll(key).filter((v): v is string => typeof v === "string");
    if (key.endsWith("[]")) out[key.slice(0, -2)] = all.filter((v) => v !== "");
    else out[key] = all[0] === "" ? undefined : all[0];
  }
  return out;
}
