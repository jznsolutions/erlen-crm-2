"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { applyAction, type ApplyState } from "@/app/(website)/actions";
import { CalendlyBooking } from "./calendly";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-light group w-full disabled:opacity-60">
      {pending ? <Loader2 className="size-5 animate-spin" /> : null}
      {pending ? "Wird gesendet …" : "Bewerbung absenden"}
      {!pending ? <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" /> : null}
    </button>
  );
}

const field = "h-14 w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-base text-white placeholder:text-white/40 outline-none transition focus:border-white/50 focus:bg-white/[0.09] aria-[invalid=true]:border-red-400";

export function ApplyForm({ calendlyUrl }: { calendlyUrl: string | null }) {
  const [state, action] = useActionState<ApplyState, FormData>(applyAction, null);
  const msgRef = useRef<HTMLTextAreaElement>(null);
  // Ergebnis des Quiz in die Nachricht übernehmen
  useEffect(() => {
    const on = (e: Event) => { if (msgRef.current) msgRef.current.value = String((e as CustomEvent).detail ?? ""); };
    window.addEventListener("erlen:quiz", on);
    return () => window.removeEventListener("erlen:quiz", on);
  }, []);
  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center" role="status">
        <CheckCircle2 className="mx-auto size-12 text-emerald-400" />
        <h3 className="mt-4 text-2xl font-semibold text-white">Danke für deine Bewerbung!</h3>
        <p className="mt-2 text-white/70">Wir melden uns in Kürze persönlich bei dir.</p>
        {calendlyUrl ? (
          <>
            <p className="mt-6 text-white/70">Noch schneller: Such dir direkt einen Termin für dein Kennenlerngespräch aus.</p>
            <CalendlyBooking url={calendlyUrl} prefill={{ name: state.values?.full_name, email: state.values?.email }} label="Jetzt Termin auswählen" />
          </>
        ) : null}
      </div>
    );
  }
  const fe = state?.fieldErrors ?? {};
  const v = state?.values;
  const err = (k: string) => (fe[k] ? <p className="mt-1.5 text-sm text-red-300">{fe[k]}</p> : null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <div>
        <label htmlFor="ap-name" className="sr-only">Vollständiger Name</label>
        <input id="ap-name" name="full_name" defaultValue={v?.full_name} autoComplete="name" required placeholder="Vollständiger Name" className={field} aria-invalid={!!fe.full_name} />
        {err("full_name")}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ap-phone" className="sr-only">Telefonnummer</label>
          <input id="ap-phone" name="phone" defaultValue={v?.phone} type="tel" autoComplete="tel" required placeholder="Telefonnummer" className={field} aria-invalid={!!fe.phone} />
          {err("phone")}
        </div>
        <div>
          <label htmlFor="ap-email" className="sr-only">E-Mail-Adresse</label>
          <input id="ap-email" name="email" defaultValue={v?.email} type="email" autoComplete="email" required placeholder="E-Mail-Adresse" className={field} aria-invalid={!!fe.email} />
          {err("email")}
        </div>
      </div>
      <div>
        <label htmlFor="ap-msg" className="sr-only">Nachricht (optional)</label>
        <textarea ref={msgRef} id="ap-msg" name="message" defaultValue={v?.message} rows={3} maxLength={2000} placeholder="Erzähl uns kurz von dir (optional)" className={field.replace("h-13", "") + " py-3"} />
      </div>
      {/* Honeypot – für Menschen unsichtbar */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <label className="flex items-start gap-3 text-sm leading-relaxed text-white/60">
        <input type="checkbox" name="consent" required className="mt-1 size-4 shrink-0 accent-white" aria-invalid={!!fe.consent} />
        <span>Ich willige ein, dass meine Angaben zur Bearbeitung meiner Bewerbung gespeichert und ich kontaktiert werde. Hinweise in der <Link href="/datenschutz" className="underline underline-offset-2 hover:text-white">Datenschutzerklärung</Link>.</span>
      </label>
      {err("consent")}
      {state && !state.ok && !Object.keys(fe).length ? <p className="text-sm text-red-300" role="alert">{state.error}</p> : null}
      <Submit />
      <p className="text-center text-xs text-white/40">Dauert keine 60 Sekunden · Kostenlos & unverbindlich</p>
    </form>
  );
}
