import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PermissionSet, type Permission, type RoleKey } from "@/lib/permissions";

export type CurrentUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  avatarPath: string | null;
  role: { key: RoleKey; name: string };
  permissions: PermissionSet;
};

/**
 * Data Access Layer: lädt den angemeldeten Benutzer genau einmal pro Anfrage.
 * Die Identität stammt aus dem geprüften JWT; Rolle und Rechte aus der Datenbank.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;
  const aal = (claimsData?.claims as { aal?: string } | undefined)?.aal;

  const [{ data: profile }, { data: perms }, mfa] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, first_name, last_name, employee_number, avatar_path, status, roles(key, name)")
      .eq("id", userId)
      .maybeSingle(),
    supabase.rpc("my_permissions"),
    aal === "aal2" ? Promise.resolve(null) : supabase.rpc("mfa_status").then((r) => r.data?.[0] ?? null),
  ]);
  // Zwei-Faktor-Anmeldung: erst Code eingeben bzw. einrichten
  if (mfa?.has_factor) redirect("/zwei-faktor");
  if (mfa?.required) redirect("/zwei-faktor/einrichten");
  if (!profile || profile.status !== "aktiv" || !profile.roles) return null;

  return {
    id: profile.id,
    email: profile.email,
    firstName: profile.first_name,
    lastName: profile.last_name,
    employeeNumber: profile.employee_number,
    avatarPath: profile.avatar_path,
    role: { key: profile.roles.key as RoleKey, name: profile.roles.name },
    permissions: new PermissionSet(perms ?? []),
  };
});

/** Für geschützte Seiten: leitet ohne gültige, aktive Sitzung zur Anmeldung. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?fehler=sitzung");
  return user;
}

/** Seite nur mit mindestens einer der Berechtigungen anzeigen. */
export async function requirePermission(...perms: Permission[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!perms.some((p) => user.permissions.has(p))) redirect("/kein-zugriff");
  return user;
}
