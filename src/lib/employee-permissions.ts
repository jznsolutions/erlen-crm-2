import type { PermissionSet } from "@/lib/permissions";

/**
 * Anmelde-E-Mail ändern dürfen: die Administration bei allen, sonst (mit employees.update)
 * nur bei Rollen unterhalb der Leitung – sonst könnte man über „Passwort vergessen“ fremde Leitungskonten übernehmen.
 */
export function canChangeEmail(permissions: PermissionSet, targetRole: string | null | undefined): boolean {
  if (permissions.has("roles.assign")) return true;
  return permissions.has("employees.update") && !["admin", "agenturleiter"].includes(targetRole ?? "admin");
}
