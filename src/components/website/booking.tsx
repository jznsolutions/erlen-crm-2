"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowLeft, CalendarCheck2, CalendarDays, Clock, Loader2 } from "lucide-react";
import { bookSlot, loadSlots, type SlotList } from "@/app/(website)/actions";

const TZ = "Europe/Berlin";
const dayKey = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date(iso));
const dayLabel = (iso: string) => ({
  wd: new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: TZ }).format(new Date(iso)).replace(".", ""),
  d: new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: TZ }).format(new Date(iso)),
});
const timeLabel = (iso: string) => new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
const longLabel = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso)) + " Uhr";

const field =
  "h-12 w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-base text-white placeholder:text-white/40 outline-none transition focus:border-white/50 focus:bg-white/[0.09] aria-[invalid=true]:border-red-400";

/** Terminkalender für Bewerbungsgespräche. Doppelbuchungen verhindert die Datenbank. */
export function BookingCalendar({ prefill }: { prefill?: { full_name?: string; email?: string; phone?: string } }) {
  const [slots, setSlots] = useState<SlotList | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [booked, setBooked] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const refresh = () => loadSlots().then((s) => setSlots(s)).catch(() => setSlots([]));
  useEffect(() => {
    refresh();
  }, []);

  const days = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of slots ?? []) {
      const k = dayKey(s.start);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s.start);
    }
    return [...m.entries()];
  }, [slots]);
  const activeDay = day && days.some(([k]) => k === day) ? day : (days[0]?.[0] ?? null);
  const times = days.find(([k]) => k === activeDay)?.[1] ?? [];

  if (booked) {
    return (
      <div className="text-center" role="status">
        <CalendarCheck2 className="mx-auto size-12 text-emerald-400" />
        <h3 className="mt-4 text-2xl font-semibold text-white">Termin bestätigt!</h3>
        <p className="mt-2 text-white/70">{longLabel(booked)}</p>
        <p className="mt-3 text-sm text-white/50">Du erhältst gleich eine Bestätigung per E-Mail und 2 Stunden vorher eine Erinnerung.</p>
      </div>
    );
  }
  if (slots === null) {
    return <div className="flex items-center justify-center gap-2 py-10 text-white/60"><Loader2 className="size-5 animate-spin" />Freie Termine werden geladen …</div>;
  }
  if (days.length === 0) {
    return <p className="py-6 text-center text-white/60">Aktuell sind keine Termine frei. Bewirb dich einfach über das Formular – wir melden uns persönlich bei dir.</p>;
  }

  if (slot) {
    return (
      <form
        className="space-y-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setError(null);
          setFieldErrors({});
          start(async () => {
            const r = await bookSlot({
              start: slot,
              full_name: String(fd.get("full_name") ?? ""),
              email: String(fd.get("email") ?? ""),
              phone: String(fd.get("phone") ?? ""),
              message: String(fd.get("message") ?? "") || undefined,
              consent: fd.get("consent") === "on",
              website: String(fd.get("website") ?? "") || undefined,
            });
            if (r.ok) return setBooked(r.start);
            setError(r.error);
            setFieldErrors(r.fieldErrors ?? {});
            if (r.taken) {
              setSlot(null);
              refresh();
            }
          });
        }}
      >
        <button type="button" onClick={() => setSlot(null)} className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white"><ArrowLeft className="size-4" />Anderen Termin wählen</button>
        <p className="flex items-center gap-2 text-lg font-semibold text-white"><Clock className="size-5 text-[#8aa4c8]" />{longLabel(slot)}</p>
        {error ? <p className="text-sm text-red-300" role="alert">{error}</p> : null}
        <div>
          <label htmlFor="bk-name" className="sr-only">Vollständiger Name</label>
          <input id="bk-name" name="full_name" defaultValue={prefill?.full_name} required autoComplete="name" placeholder="Vollständiger Name" className={field} aria-invalid={!!fieldErrors.full_name} />
          {fieldErrors.full_name ? <p className="mt-1 text-sm text-red-300">{fieldErrors.full_name}</p> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="bk-email" className="sr-only">E-Mail-Adresse</label>
            <input id="bk-email" name="email" type="email" defaultValue={prefill?.email} required autoComplete="email" placeholder="E-Mail-Adresse" className={field} aria-invalid={!!fieldErrors.email} />
            {fieldErrors.email ? <p className="mt-1 text-sm text-red-300">{fieldErrors.email}</p> : null}
          </div>
          <div>
            <label htmlFor="bk-phone" className="sr-only">Telefonnummer</label>
            <input id="bk-phone" name="phone" type="tel" defaultValue={prefill?.phone} required autoComplete="tel" placeholder="Telefonnummer" className={field} aria-invalid={!!fieldErrors.phone} />
            {fieldErrors.phone ? <p className="mt-1 text-sm text-red-300">{fieldErrors.phone}</p> : null}
          </div>
        </div>
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
          <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
        </div>
        <label className="flex items-start gap-3 text-sm leading-relaxed text-white/60">
          <input type="checkbox" name="consent" required className="mt-1 size-4 shrink-0 accent-white" />
          <span>Ich willige ein, dass meine Angaben zur Terminvereinbarung und Bearbeitung meiner Bewerbung gespeichert werden. Hinweise in der <Link href="/datenschutz" className="underline underline-offset-2 hover:text-white">Datenschutzerklärung</Link>.</span>
        </label>
        {fieldErrors.consent ? <p className="text-sm text-red-300">{fieldErrors.consent}</p> : null}
        <button type="submit" disabled={pending} className="btn-light w-full disabled:opacity-60">
          {pending ? <Loader2 className="size-5 animate-spin" /> : <CalendarCheck2 className="size-5" />}
          {pending ? "Wird gebucht …" : "Termin verbindlich buchen"}
        </button>
      </form>
    );
  }

  return (
    <div>
      {error ? <p className="mb-3 text-sm text-red-300" role="alert">{error}</p> : null}
      <p className="mb-3 flex items-center gap-2 text-sm font-medium text-white/70"><CalendarDays className="size-4" />Tag wählen</p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2" role="listbox" aria-label="Tag">
        {days.map(([k, list]) => {
          const l = dayLabel(list[0]);
          const on = k === activeDay;
          return (
            <button
              key={k}
              type="button"
              role="option"
              aria-selected={on}
              onClick={() => setDay(k)}
              className={`flex min-w-16 shrink-0 flex-col items-center rounded-2xl border px-3 py-2.5 transition ${on ? "border-white bg-white text-[#0b0f1a]" : "border-white/15 bg-white/[0.04] text-white hover:border-white/40"}`}
            >
              <span className="text-xs uppercase tracking-wider opacity-70">{l.wd}</span>
              <span className="text-base font-semibold">{l.d}</span>
            </button>
          );
        })}
      </div>
      <p className="mb-3 mt-4 flex items-center gap-2 text-sm font-medium text-white/70"><Clock className="size-4" />Uhrzeit wählen</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {times.map((t) => (
          <button key={t} type="button" onClick={() => setSlot(t)} className="rounded-xl border border-white/15 bg-white/[0.04] py-2.5 text-sm font-semibold text-white transition hover:border-white hover:bg-white hover:text-[#0b0f1a]" aria-label={`Termin ${longLabel(t)}`}>
            {timeLabel(t)}
          </button>
        ))}
      </div>
      <p className="mt-4 text-xs text-white/40">Bereits vergebene Termine werden nicht angezeigt. Du und wir erhalten eine Bestätigung per E-Mail.</p>
    </div>
  );
}
