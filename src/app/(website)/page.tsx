import type { Metadata } from "next";
import Image from "next/image";
import {
  ArrowRight, BarChart3, Cable, Check, ChevronDown, GraduationCap, Flame, LineChart, MessageCircle, Rocket, SunMedium, Users, Workflow, Zap,
} from "lucide-react";
import { SITE } from "@/lib/site";
import { ApplyForm } from "@/components/website/apply-form";
import { CountUp } from "@/components/website/count-up";

export const metadata: Metadata = {
  title: { absolute: "ERLEN Vertriebsagentur – Karriere im Vertrieb mit leistungsabhängigem Einkommen" },
  description: SITE.description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "de_DE",
    url: "/",
    siteName: SITE.name,
    title: `${SITE.name} – ${SITE.claim}`,
    description: SITE.description,
    images: [{ url: "/login-bg.jpg", width: 1177, height: 657, alt: "ERLEN Vertriebsagentur" }],
  },
  robots: { index: true, follow: true },
};

const BENEFITS = [
  { icon: LineChart, title: "Einkommen nach Leistung", text: "Dein Verdienst hängt davon ab, was du bewegst – nicht davon, wie lange du irgendwo sitzt." },
  { icon: Workflow, title: "Klare Prozesse", text: "Vom ersten Kundenkontakt bis zum Abschluss weißt du genau, was zu tun ist. Kein Rätselraten." },
  { icon: GraduationCap, title: "Training in der ERLEN Academy", text: "Strukturierte Schulungen, Leitfäden und ein persönlicher Ausbilder, der dich begleitet." },
  { icon: BarChart3, title: "Echtes Performance-Tracking", text: "Ziele, Fortschritt und Rankings jederzeit im eigenen Mitarbeiterportal – transparent und fair." },
  { icon: Users, title: "Starkes Team", text: "Teamleiter, die selbst verkaufen, und ein Umfeld, in dem Leistung gesehen wird." },
  { icon: Rocket, title: "Entwicklung", text: "Vom Vertriebspartner über Ausbilder bis zur Teamleitung – deine Ergebnisse öffnen dir die nächsten Schritte." },
];

const PRODUCTS = [
  { icon: Cable, title: "Glasfaser", text: "Schnelles Internet für Haushalte – ein Produkt, das Menschen wirklich brauchen." },
  { icon: SunMedium, title: "Photovoltaik", text: "Qualifizierte Interessenten für Solaranlagen in einem wachsenden Markt." },
  { icon: Zap, title: "Strom", text: "Energieverträge, die Kunden spürbar entlasten können." },
  { icon: Flame, title: "Gas", text: "Ergänzend zu Strom – für einen vollständigen Energie-Check beim Kunden." },
];

const STEPS = [
  { title: "Bewerben", text: "Name, Telefonnummer, E-Mail – mehr brauchen wir nicht. Dauert keine 60 Sekunden." },
  { title: "Kennenlernen", text: "Wir melden uns persönlich, beantworten deine Fragen und schauen gemeinsam, ob es passt." },
  { title: "Onboarding & Training", text: "Du erhältst deinen Zugang zum Portal und startest mit der ERLEN Academy und deinem Ausbilder." },
  { title: "Durchstarten", text: "Mit Team, klaren Zielen und Echtzeit-Überblick über deine Ergebnisse legst du los." },
];

const FAQ = [
  { q: "Brauche ich Vertriebserfahrung?", a: "Nein. Entscheidend sind Motivation, Zuverlässigkeit und der Wille zu lernen. Das nötige Wissen vermitteln wir dir im Training und durch deinen Ausbilder." },
  { q: "Wie wird die Tätigkeit vergütet?", a: "Die Vergütung ist leistungsabhängig. Die konkreten Konditionen besprechen wir offen im persönlichen Kennenlerngespräch." },
  { q: "Wie läuft die Bewerbung ab?", a: "Du füllst das kurze Formular aus, wir melden uns zeitnah bei dir und vereinbaren ein unverbindliches Gespräch." },
  { q: "Wie werde ich eingearbeitet?", a: "Über die ERLEN Academy mit Lektionen, Leitfäden und Wissenstests – begleitet von einem festen Ausbilder aus dem Team." },
  { q: "Wo sehe ich meine Ergebnisse?", a: "Im ERLEN-Mitarbeiterportal: Tages-, Wochen- und Monatsleistung, Ziele, Rankings und Schulungsfortschritt auf einen Blick." },
];

function SectionHeading({ eyebrow, title, text, center = false }: { eyebrow: string; title: string; text?: string; center?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8aa4c8]">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
      {text ? <p className="mt-4 text-lg leading-relaxed text-white/60">{text}</p> : null}
    </div>
  );
}

export default function HomePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: SITE.url,
    logo: `${SITE.url}/erlen-logo.png`,
    description: SITE.description,
    ...(SITE.email ? { email: SITE.email } : {}),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero */}
      <section className="relative isolate flex min-h-[100svh] items-center overflow-hidden">
        <Image src="/login-bg.jpg" alt="" fill priority sizes="100vw" className="-z-20 object-cover object-center opacity-60" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0b0f1a]/70 via-[#0b0f1a]/60 to-[#0b0f1a]" aria-hidden />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,rgba(30,42,71,0.55),transparent_60%)]" aria-hidden />
        <div className="mx-auto w-full max-w-6xl px-5 pb-20 pt-32 sm:px-8">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/80 backdrop-blur">
            <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden /> Wir suchen Vertriebspartner
          </p>
          <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-6xl lg:text-7xl">
            Verdiene Geld im Vertrieb.<br /><span className="text-white/55">Nicht mit Zeit.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70 sm:text-xl">Baue dir ein Einkommen auf, das von deiner Leistung abhängt – mit klaren Prozessen, echtem Training und einem Team, das dich nach vorne bringt.</p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <a href="#bewerben" className="group inline-flex h-14 items-center justify-center gap-2 rounded-full bg-white px-8 text-base font-semibold text-[#0b0f1a] shadow-[0_0_40px_rgba(255,255,255,0.15)] transition hover:bg-white/90">
              Jetzt in 60 Sek. bewerben <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a href="#warum-erlen" className="inline-flex h-14 items-center justify-center rounded-full border border-white/20 px-8 text-base font-medium text-white transition hover:bg-white/10">Mehr erfahren</a>
          </div>
          <ul className="mt-12 flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/60">
            {["Ohne Vorerfahrung möglich", "Persönlicher Ausbilder", "Leistungsabhängiges Einkommen"].map((t) => (
              <li key={t} className="flex items-center gap-2"><Check className="size-4 text-emerald-400" />{t}</li>
            ))}
          </ul>
        </div>
        <a href="#zahlen" aria-label="Weiter nach unten" className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/40 transition hover:text-white"><ChevronDown className="size-7 animate-bounce" /></a>
      </section>

      {/* Zahlen */}
      <section id="zahlen" className="border-y border-white/10 bg-[#0d1220]">
        <dl className="mx-auto grid max-w-6xl grid-cols-1 divide-y divide-white/10 px-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-8">
          {SITE.stats.map((s) => (
            <div key={s.label} className="py-10 text-center">
              <dd className="text-5xl font-semibold tracking-tight text-white sm:text-6xl"><CountUp value={s.value} suffix={s.suffix} /></dd>
              <dt className="mt-2 text-sm uppercase tracking-[0.18em] text-white/50">{s.label}</dt>
            </div>
          ))}
        </dl>
      </section>

      {/* Leistung */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Unsere Haltung" title="Hier entscheidet Leistung." />
            <p className="mt-6 text-xl leading-relaxed text-white/70">Kein Chef, der dich klein hält. Keine Limits nach oben. Kein leeres Gerede.</p>
            <p className="mt-4 text-xl leading-relaxed text-white">Wenn du lieferst, verdienst du. Punkt.</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#1e2a47] to-[#0d1220] p-8 sm:p-10">
            <p className="text-sm font-medium text-white/50">Du hast zwei Optionen:</p>
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white/50 line-through decoration-white/30">Weiter durchschnittlich bleiben …</div>
              <div className="rounded-2xl border border-white/30 bg-white/[0.08] p-5 font-medium text-white">… oder anfangen, im Vertrieb richtig Geld zu verdienen.</div>
            </div>
            <a href="#bewerben" className="mt-8 inline-flex items-center gap-2 font-semibold text-white hover:underline">Option zwei wählen <ArrowRight className="size-4" /></a>
          </div>
        </div>
      </section>

      {/* Vorteile */}
      <section id="warum-erlen" className="scroll-mt-20 bg-[#0d1220] py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <SectionHeading eyebrow="Warum ERLEN" title="Alles, was du für deinen Erfolg im Vertrieb brauchst." text="Wir verbinden ehrlichen Vertrieb mit Struktur, Ausbildung und Transparenz – damit aus Einsatz messbare Ergebnisse werden." />
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((b) => (
              <article key={b.title} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-7 transition hover:-translate-y-1 hover:border-white/25 hover:bg-white/[0.05]">
                <span className="flex size-11 items-center justify-center rounded-xl bg-[#1e2a47] text-[#b7cbe6]"><b.icon className="size-5" /></span>
                <h3 className="mt-5 text-lg font-semibold text-white">{b.title}</h3>
                <p className="mt-2 leading-relaxed text-white/60">{b.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Produkte */}
      <section id="produkte" className="scroll-mt-20 mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <SectionHeading eyebrow="Was wir vertreiben" title="Produkte, die Haushalte wirklich brauchen." text="Wir arbeiten mit Produkten aus Telekommunikation und Energie – verständlich, gefragt und mit echtem Nutzen für Kunden." />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PRODUCTS.map((p) => (
            <article key={p.title} className="rounded-2xl border border-white/10 p-7">
              <p.icon className="size-7 text-[#8aa4c8]" />
              <h3 className="mt-5 text-lg font-semibold text-white">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{p.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Ablauf */}
      <section id="ablauf" className="scroll-mt-20 bg-[#0d1220] py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <SectionHeading eyebrow="Dein Weg zu ERLEN" title="In vier Schritten zum Start." center />
          <div className="relative mt-16">
          <div className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-white/20 to-transparent md:block" aria-hidden />
          <ol className="relative grid gap-8 md:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative text-center">
                <span className="relative mx-auto flex size-12 items-center justify-center rounded-full border border-white/20 bg-[#0b0f1a] text-lg font-semibold text-white">{i + 1}</span>
                <h3 className="mt-5 text-lg font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{s.text}</p>
              </li>
            ))}
          </ol>
          </div>
          <div className="mt-14 text-center">
            <a href="#bewerben" className="inline-flex h-13 items-center gap-2 rounded-full bg-white px-8 font-semibold text-[#0b0f1a] transition hover:bg-white/90">Schritt 1 jetzt starten <ArrowRight className="size-5" /></a>
          </div>
        </div>
      </section>

      {/* Für wen */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <SectionHeading eyebrow="Für wen" title="Passt ERLEN zu dir?" center />
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {[
            { t: "Quereinsteiger", d: "Du willst raus aus dem Stundenlohn und zeigen, was in dir steckt." },
            { t: "Studierende & Berufsstarter", d: "Du suchst flexible Arbeit, bei der sich Einsatz direkt auszahlt." },
            { t: "Vertriebsprofis", d: "Du kannst verkaufen und willst ein Umfeld mit Struktur und Perspektive." },
          ].map((x) => (
            <div key={x.t} className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-7">
              <h3 className="text-lg font-semibold text-white">{x.t}</h3>
              <p className="mt-2 leading-relaxed text-white/60">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 bg-[#0d1220] py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <SectionHeading eyebrow="FAQ" title="Häufige Fragen" center />
          <div className="mt-12 divide-y divide-white/10 border-y border-white/10">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-lg font-medium text-white [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown className="size-5 shrink-0 text-white/50 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 leading-relaxed text-white/60">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }) }} />
      </section>

      {/* Bewerbung */}
      <section id="bewerben" className="scroll-mt-20 relative overflow-hidden py-24 sm:py-32">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(30,42,71,0.7),transparent_70%)]" aria-hidden />
        <div className="mx-auto grid max-w-6xl items-start gap-12 px-5 sm:px-8 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Bewerbung" title="Jetzt in 60 Sekunden bewerben." text="Kein Lebenslauf, kein Anschreiben. Hinterlasse deine Kontaktdaten – wir melden uns persönlich bei dir." />
            <ul className="mt-8 space-y-3 text-white/70">
              {["Persönlicher Rückruf durch unser Team", "Unverbindliches Kennenlerngespräch", "Start mit Training und festem Ausbilder"].map((t) => (
                <li key={t} className="flex items-center gap-3"><span className="flex size-6 items-center justify-center rounded-full bg-emerald-400/15"><Check className="size-3.5 text-emerald-400" /></span>{t}</li>
              ))}
            </ul>
            {SITE.whatsapp ? (
              <a href={`https://wa.me/${SITE.whatsapp}`} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex items-center gap-2 text-white/70 hover:text-white"><MessageCircle className="size-5" />Lieber per WhatsApp schreiben</a>
            ) : null}
          </div>
          <div className="rounded-3xl border border-white/10 bg-[#0d1220]/80 p-6 shadow-2xl backdrop-blur sm:p-8">
            <ApplyForm calendlyUrl={SITE.calendlyUrl} />
          </div>
        </div>
      </section>
    </>
  );
}
