"use client";
import { useState } from "react";
import { CalendarDays } from "lucide-react";

/** Baut die Calendly-Adresse für die Einbettung (mit vorausgefülltem Namen/E-Mail). */
export function calendlySrc(url: string, prefill?: { name?: string; email?: string }) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !/(^|\.)calendly\.com$/.test(u.hostname)) return null;
    if (typeof window !== "undefined") u.searchParams.set("embed_domain", window.location.hostname);
    u.searchParams.set("embed_type", "Inline");
    u.searchParams.set("hide_gdpr_banner", "1");
    u.searchParams.set("background_color", "0b0f1a");
    u.searchParams.set("text_color", "ffffff");
    u.searchParams.set("primary_color", "8aa4c8");
    if (prefill?.name) u.searchParams.set("name", prefill.name);
    if (prefill?.email) u.searchParams.set("email", prefill.email);
    return u.toString();
  } catch {
    return null;
  }
}

// Zwei-Klick-Lösung: Calendly wird erst nach aktivem Klick geladen (Datenschutz).
// Die Terminbestätigung per E-Mail an Bewerber und an uns verschickt Calendly selbst.
export function CalendlyBooking({
  url,
  prefill,
  label = "Termin auswählen",
  compact = false,
}: {
  url: string;
  prefill?: { name?: string; email?: string };
  label?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  if (open && src) {
    return (
      <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f1a]">
        <iframe src={src} title="Termin mit ERLEN buchen" className="h-[700px] w-full" loading="lazy" />
      </div>
    );
  }
  return (
    <div className={compact ? "" : "mt-6"}>
      <button
        type="button"
        onClick={() => {
          const s = calendlySrc(url, prefill);
          if (!s) return void window.open(url, "_blank", "noopener,noreferrer");
          setSrc(s);
          setOpen(true);
        }}
        className="btn-light group"
      >
        <CalendarDays className="size-5" />
        {label}
      </button>
      <p className="mt-2 text-xs text-white/40">
        Beim Öffnen wird der Buchungskalender von Calendly geladen. Du und wir erhalten danach automatisch eine Terminbestätigung per
        E-Mail.
      </p>
    </div>
  );
}
