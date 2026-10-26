// Berechtigungsschlüssel (müssen mit public.permissions übereinstimmen).
export const PERMISSIONS = [
  "employees.read.self",
  "employees.read.assigned",
  "employees.read.team",
  "employees.read.all",
  "employees.update",
  "employees.invite",
  "employees.deactivate",
  "roles.assign",
  "teams.manage",
  "performance.read.self",
  "performance.read.assigned",
  "performance.read.team",
  "performance.read.all",
  "performance.create",
  "performance.update",
  "performance.approve",
  "products.manage",
  "products.assign",
  "commissions.manage",
  "statements.read.self",
  "statements.manage",
  "targets.manage",
  "competitions.manage",
  "rankings.read",
  "training.read",
  "training.manage",
  "training.progress.read.self",
  "training.progress.read.assigned",
  "training.progress.read.team",
  "training.progress.read.all",
  "training.progress.manage",
  "training.notes.write",
  "documents.read",
  "documents.manage",
  "announcements.manage",
  "reports.read.team",
  "reports.read.all",
  "reports.export",
  "applicants.read",
  "applicants.manage",
  "settings.manage",
  "audit.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type RoleKey = "vertriebspartner" | "ausbilder" | "teamleiter" | "agenturleiter" | "admin";

export const ROLE_LABELS: Record<RoleKey, string> = {
  vertriebspartner: "Vertriebspartner",
  ausbilder: "Ausbilder",
  teamleiter: "Teamleiter",
  agenturleiter: "Agenturleiter",
  admin: "Systemadministrator",
};

export class PermissionSet {
  private readonly set: ReadonlySet<string>;
  constructor(list: readonly string[]) {
    this.set = new Set(list);
  }
  has(p: Permission) {
    return this.set.has(p);
  }
  any(...ps: Permission[]) {
    return ps.some((p) => this.set.has(p));
  }
  list() {
    return [...this.set];
  }
}

/** Welche Dashboard-Variante passt zum Berechtigungsumfang? (Darstellung – Daten schützt RLS.) */
export type DashboardKind = "agentur" | "team" | "ausbilder" | "partner";

export function dashboardKind(perms: PermissionSet): DashboardKind {
  if (perms.has("performance.read.all")) return "agentur";
  if (perms.has("performance.read.team")) return "team";
  if (perms.has("performance.read.assigned")) return "ausbilder";
  return "partner";
}
