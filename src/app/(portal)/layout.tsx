import Link from "next/link";
import { Bell } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/storage";
import { NAV, type NavSection } from "@/components/layout/nav";
import { MobileNav, Sidebar } from "@/components/layout/sidebar";
import { UserMenu } from "@/components/layout/user-menu";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const supabase = await createClient();

  // Menüpunkte nach Berechtigung filtern (nur Darstellung – Zugriff schützt der Server)
  const sections: NavSection[] = NAV.map((s) => ({
    ...s,
    items: s.items.filter((i) => i.any === "all" || i.any.some((p) => user.permissions.has(p))),
  })).filter((s) => s.items.length > 0);

  const [{ count: unread }, pendingApprovals, avatarUrl] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    user.permissions.has("performance.approve")
      ? supabase.from("performance_records").select("id", { count: "exact", head: true }).eq("status", "eingereicht").neq("user_id", user.id)
      : Promise.resolve({ count: 0 }),
    signedUrl("avatars", user.avatarPath, 3600),
  ]);
  const badges: Record<string, number> = { "/leistungen/freigaben": pendingApprovals.count ?? 0 };

  return (
    <div className="min-h-dvh">
      <Sidebar sections={sections} badges={badges} />
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card/90 px-4 backdrop-blur sm:px-6">
          <MobileNav sections={sections} badges={badges} />
          <div className="flex-1" />
          <Link href="/benachrichtigungen" className="relative inline-flex size-10 items-center justify-center rounded-md hover:bg-muted" aria-label={`Benachrichtigungen${unread ? ` (${unread} ungelesen)` : ""}`}>
            <Bell className="size-5" />
            {unread ? (
              <span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-white tabular">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Link>
          <UserMenu first={user.firstName} last={user.lastName} role={user.role.name} avatarUrl={avatarUrl} />
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
