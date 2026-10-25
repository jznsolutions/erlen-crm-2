import type { Permission } from "@/lib/permissions";

export type NavItem = { href: string; label: string; icon: string; any: Permission[] | "all" };
export type NavSection = { title?: string; items: NavItem[] };

export const NAV: NavSection[] = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", any: "all" },
      { href: "/leistungen", label: "Leistungen", icon: "TrendingUp", any: ["performance.read.self", "performance.read.team", "performance.read.all", "performance.read.assigned"] },
      { href: "/leistungen/freigaben", label: "Freigaben", icon: "CheckCheck", any: ["performance.approve"] },
      { href: "/ziele", label: "Ziele & Rankings", icon: "Target", any: "all" },
      { href: "/academy", label: "ERLEN Academy", icon: "GraduationCap", any: ["training.read", "training.manage"] },
      { href: "/dokumente", label: "Dokumente", icon: "FileText", any: ["documents.read", "documents.manage"] },
    ],
  },
  {
    title: "Organisation",
    items: [
      { href: "/mitarbeiter", label: "Mitarbeiter", icon: "Users", any: ["employees.read.assigned", "employees.read.team", "employees.read.all"] },
      { href: "/teams", label: "Teams", icon: "Network", any: ["employees.read.team", "employees.read.all", "teams.manage"] },
      { href: "/berichte", label: "Berichte", icon: "BarChart3", any: ["reports.read.team", "reports.read.all"] },
      { href: "/bewerber", label: "Bewerber", icon: "Inbox", any: ["applicants.read"] },
    ],
  },
  {
    title: "Verwaltung",
    items: [
      { href: "/admin/benutzer", label: "Benutzer & Einladungen", icon: "UserPlus", any: ["employees.invite", "roles.assign", "employees.deactivate"] },
      { href: "/admin/rollen", label: "Rollen & Rechte", icon: "ShieldCheck", any: ["roles.assign"] },
      { href: "/admin/produkte", label: "Produkte", icon: "Package", any: ["products.manage"] },
      { href: "/admin/academy", label: "Academy verwalten", icon: "BookOpen", any: ["training.manage"] },
      { href: "/admin/dokumente", label: "Dokumente verwalten", icon: "FolderLock", any: ["documents.manage", "announcements.manage"] },
      { href: "/admin/wettbewerbe", label: "Wettbewerbe", icon: "Trophy", any: ["competitions.manage"] },
      { href: "/admin/einstellungen", label: "Einstellungen", icon: "Settings", any: ["settings.manage"] },
      { href: "/admin/audit", label: "Audit-Log", icon: "ScrollText", any: ["audit.read"] },
    ],
  },
];
