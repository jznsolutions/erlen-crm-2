"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, BookOpen, CheckCheck, FileText, FolderLock, GraduationCap, Inbox, LayoutDashboard, Menu, Network,
  Package, ScrollText, Settings, ShieldCheck, Target, TrendingUp, Trophy, UserPlus, Users,
} from "lucide-react";
import { Sheet } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { NavSection } from "./nav";

const ICONS = {
  BarChart3, BookOpen, CheckCheck, FileText, FolderLock, GraduationCap, Inbox, LayoutDashboard, Network,
  Package, ScrollText, Settings, ShieldCheck, Target, TrendingUp, Trophy, UserPlus, Users,
} as const;

function NavList({ sections, onNavigate, badges }: { sections: NavSection[]; onNavigate?: () => void; badges: Record<string, number> }) {
  const pathname = usePathname();
  const allHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (!pathname.startsWith(href + "/")) return false;
    // Längster passender Eintrag gewinnt (z. B. /leistungen/freigaben vor /leistungen)
    return !allHrefs.some((h) => h !== href && h.startsWith(href + "/") && (pathname === h || pathname.startsWith(h + "/")));
  };
  return (
    <nav className="flex flex-col gap-6 px-3 py-4" aria-label="Hauptnavigation">
      {sections.map((section, i) => (
        <div key={i}>
          {section.title ? <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/35">{section.title}</p> : null}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const Icon = ICONS[item.icon as keyof typeof ICONS];
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      active ? "bg-sidebar-active text-white" : "text-sidebar-foreground hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badges[item.href] ? (
                      <span className="rounded-full bg-white/15 px-1.5 text-[11px] font-medium text-white tabular">{badges[item.href]}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex h-16 items-center border-b border-sidebar-border px-6">
      <Image src="/erlen-logo.png" alt="ERLEN Vertriebsagentur" width={120} height={34} />
    </Link>
  );
}

export function Sidebar({ sections, badges }: { sections: NavSection[]; badges: Record<string, number> }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar lg:flex">
      <Brand />
      <div className="flex-1 overflow-y-auto">
        <NavList sections={sections} badges={badges} />
      </div>
    </aside>
  );
}

export function MobileNav({ sections, badges }: { sections: NavSection[]; badges: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex size-10 items-center justify-center rounded-md text-foreground hover:bg-muted lg:hidden"
        aria-label="Menü öffnen"
      >
        <Menu className="size-5" />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Navigation">
        <Brand />
        <NavList sections={sections} onNavigate={() => setOpen(false)} badges={badges} />
      </Sheet>
    </>
  );
}
