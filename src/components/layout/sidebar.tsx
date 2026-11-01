"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, BookOpen, CalendarClock, CheckCheck, FileSignature, FileText, FolderLock, FolderUp, GraduationCap, Inbox, LayoutDashboard, Menu, Network,
  Package, Percent, Receipt, Rocket, ScrollText, Settings, ShieldCheck, Target, TrendingUp, Trophy, UserPlus, Users,
} from "lucide-react";
import { Sheet } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { NavSection } from "./nav";

const ICONS = {
  BarChart3, BookOpen, CalendarClock, CheckCheck, FileSignature, FileText, FolderLock, FolderUp, GraduationCap, Inbox, LayoutDashboard, Network,
  Package, Percent, Receipt, Rocket, ScrollText, Settings, ShieldCheck, Target, TrendingUp, Trophy, UserPlus, Users,
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
          {section.title ? (
            <p className="mb-2 flex items-center gap-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
              <span aria-hidden className="h-px w-3 bg-gradient-to-r from-[#818cf8] to-transparent" />
              {section.title}
            </p>
          ) : null}
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
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-200",
                      active
                        ? "bg-gradient-to-r from-[#4f8bff]/25 via-[#7c5cff]/15 to-transparent font-medium text-white shadow-[inset_0_0_0_1px_#818cf833]"
                        : "text-sidebar-foreground hover:translate-x-0.5 hover:bg-white/[0.05] hover:text-white",
                    )}
                  >
                    {active ? <span aria-hidden className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-[image:var(--brand-gradient)] shadow-[0_0_12px_#7c5cff]" /> : null}
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
                        active ? "bg-[image:var(--brand-gradient)] text-white shadow-[0_6px_18px_-6px_#7c5cff]" : "bg-white/[0.04] ring-1 ring-white/5 group-hover:bg-white/[0.08] group-hover:text-[#c7cfff]",
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <span className="flex-1 leading-tight">{item.label}</span>
                    {badges[item.href] ? (
                      <span className="portal-pulse rounded-full bg-gradient-to-r from-[#ff5f6d] to-[#ff7b86] px-1.5 text-[11px] font-bold text-white tabular">{badges[item.href]}</span>
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
    <Link href="/dashboard" className="relative flex h-16 items-center border-b border-sidebar-border px-6">
      <span aria-hidden className="pointer-events-none absolute left-6 top-1/2 h-10 w-32 -translate-y-1/2 rounded-full bg-[#7c5cff] opacity-25 blur-2xl" />
      <Image src="/erlen-logo.png" alt="ERLEN Vertriebsagentur" width={120} height={34} className="relative" />
    </Link>
  );
}

export function Sidebar({ sections, badges }: { sections: NavSection[]; badges: Record<string, number> }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-gradient-to-b from-[#070b18]/95 via-sidebar/95 to-[#0a0718]/95 backdrop-blur-xl lg:flex">
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-[#818cf8]/40 to-transparent" />
      <Brand />
      <div className="flex-1 overflow-y-auto">
        <NavList sections={sections} badges={badges} />
      </div>
      <div className="m-3 rounded-2xl border border-white/10 bg-gradient-to-br from-[#4f8bff]/15 via-[#7c5cff]/10 to-[#22d3ee]/10 p-3 text-xs text-white/60">
        <p className="font-semibold text-white/90">ERLEN Portal</p>
        <p>Verdiene Geld im Vertrieb.<br />Nicht mit Zeit.</p>
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
