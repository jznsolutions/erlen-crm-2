"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/#ueber", label: "Über ERLEN" },
  { href: "/#maerkte", label: "Märkte" },
  { href: "/#karriere", label: "Karriere" },
  { href: "/#quiz", label: "Passt es?" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 transition-all duration-500", scrolled || open ? "border-b border-white/10 bg-[#0b0f1a]/75 shadow-[0_10px_40px_-20px_rgba(0,0,0,.8)] backdrop-blur-xl" : "bg-transparent")}>
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
        <Link href="/" aria-label="ERLEN Vertriebsagentur – Startseite" className="shrink-0">
          <Image src="/erlen-logo.png" alt="ERLEN Vertriebsagentur" width={140} height={39} priority />
        </Link>
        <nav aria-label="Hauptnavigation" className="hidden items-center gap-8 text-[13px] font-medium uppercase tracking-[0.14em] text-white/60 lg:flex">
          {NAV.map((n) => <Link key={n.href} href={n.href} className="transition-colors hover:text-white">{n.label}</Link>)}
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" prefetch={false} className="hidden text-[13px] font-medium uppercase tracking-[0.14em] text-white/45 transition-colors hover:text-white sm:block">Login</Link>
          <Link href="/#bewerben" className="btn-primary !h-11 !px-6 !text-[0.78rem]">Bewerben</Link>
          <button type="button" className="inline-flex size-11 items-center justify-center rounded-full border border-white/15 text-white lg:hidden" aria-label={open ? "Menü schließen" : "Menü öffnen"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open ? (
        <nav aria-label="Mobile Navigation" className="rise border-t border-white/10 px-5 pb-8 pt-4 lg:hidden">
          {NAV.map((n) => <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="font-display block py-3 text-2xl font-extrabold uppercase text-white">{n.label}</Link>)}
          <Link href="/login" prefetch={false} className="mt-6 block text-sm uppercase tracking-[0.2em] text-white/45">Mitarbeiter-Login</Link>
        </nav>
      ) : null}
    </header>
  );
}
