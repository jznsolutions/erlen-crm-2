"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/#warum-erlen", label: "Warum ERLEN" },
  { href: "/#produkte", label: "Was wir vertreiben" },
  { href: "/#ablauf", label: "Dein Weg" },
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
    <header className={cn("fixed inset-x-0 top-0 z-50 transition-colors duration-300", scrolled || open ? "border-b border-white/10 bg-[#0b0f1a]/90 backdrop-blur-md" : "bg-transparent")}>
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-6 px-5 sm:px-8">
        <Link href="/" aria-label="ERLEN Vertriebsagentur – Startseite" className="shrink-0">
          <Image src="/erlen-logo.png" alt="ERLEN Vertriebsagentur" width={132} height={37} priority />
        </Link>
        <nav aria-label="Hauptnavigation" className="hidden items-center gap-8 text-sm text-white/70 md:flex">
          {NAV.map((n) => <a key={n.href} href={n.href} className="transition-colors hover:text-white">{n.label}</a>)}
        </nav>
        <div className="hidden items-center gap-4 md:flex">
          <Link href="/login" prefetch={false} className="text-sm text-white/60 transition-colors hover:text-white">Login</Link>
          <Link href="/#bewerben" className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#0b0f1a] transition hover:bg-white/90">Jetzt bewerben</Link>
        </div>
        <button type="button" className="inline-flex size-10 items-center justify-center rounded-md text-white md:hidden" aria-label={open ? "Menü schließen" : "Menü öffnen"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>
      {open ? (
        <nav aria-label="Mobile Navigation" className="border-t border-white/10 px-5 pb-6 pt-2 md:hidden">
          {NAV.map((n) => <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="block py-3 text-base text-white/80">{n.label}</a>)}
          <Link href="/#bewerben" onClick={() => setOpen(false)} className="mt-3 block rounded-full bg-white py-3 text-center font-semibold text-[#0b0f1a]">Jetzt bewerben</Link>
          <Link href="/login" prefetch={false} className="mt-4 block text-center text-sm text-white/50">Mitarbeiter-Login</Link>
        </nav>
      ) : null}
    </header>
  );
}
