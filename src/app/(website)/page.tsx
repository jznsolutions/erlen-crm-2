import type { Metadata } from "next";
import Image from "next/image";
import {
  ArrowRight, BarChart3, Cable, CalendarDays, Check, ChevronDown, GraduationCap, Mail, MapPin, Phone, Plus, SunMedium, Target, UserRound, Users, Zap,
} from "lucide-react";
import { SITE } from "@/lib/site";
import { BookingCalendar } from "@/components/website/booking";
import { ApplyForm } from "@/components/website/apply-form";
import { CountUp } from "@/components/website/count-up";
import { FitQuiz } from "@/components/website/quiz";

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

const MARKETS = [
  { no: "01", tag: "Telekommunikation", icon: Cable, title: "Glasfaser", text: "Schnelles Internet für Haushalte – ein Produkt mit echtem Nutzen, das Menschen heute brauchen." },
  { no: "02", tag: "Energie", icon: SunMedium, title: "Photovoltaik", text: "Qualifizierte Gespräche rund um Solarenergie in einem der wachstumsstärksten Märkte." },
  { no: "03", tag: "Energie", icon: Zap, title: "Strom & Gas", text: "Energieverträge, die Kunden entlasten – verständlich erklärt und fair beraten." },
];

const BENEFITS = [
  "Einkommen, das von deiner Leistung abhängt",
  "Persönlicher Ausbilder vom ersten Tag an",
  "Professionelles Schulungssystem – die ERLEN Academy",
  "Eigenes Portal mit Zielen, Rankings & Echtzeit-Leistung",
  "Klarer Karrierepfad bis zur Teamleitung",
  "Starkes Team statt Einzelkämpfer",
];

const PILLARS = [
  { icon: Target, title: "Klare Prozesse", text: "Vom ersten Kontakt bis zum Abschluss weißt du genau, was zu tun ist." },
  { icon: GraduationCap, title: "Echtes Training", text: "Lektionen, Leitfäden, Wissenstests – und ein Ausbilder, der dich begleitet." },
  { icon: BarChart3, title: "Performance-Tracking", text: "Deine Zahlen, Ziele und Fortschritte jederzeit transparent im Portal." },
];

const STEPS = [
  { title: "Bewerben", text: "Name, Telefon, E-Mail. Keine 60 Sekunden." },
  { title: "Kennenlernen", text: "Persönliches, unverbindliches Gespräch." },
  { title: "Onboarding", text: "Zugang zum Portal, Academy & Ausbilder." },
  { title: "Durchstarten", text: "Mit Team, Zielen und klarem Plan." },
];

const FAQ = [
  { q: "Brauche ich Vertriebserfahrung?", a: "Nein. Entscheidend sind Motivation, Zuverlässigkeit und der Wille zu lernen. Das nötige Wissen vermitteln wir dir im Training und durch deinen Ausbilder." },
  { q: "Wie wird die Tätigkeit vergütet?", a: "Die Vergütung ist leistungsabhängig. Die konkreten Konditionen besprechen wir offen im persönlichen Kennenlerngespräch." },
  { q: "Wie läuft die Bewerbung ab?", a: "Du füllst das kurze Formular aus, wir melden uns zeitnah persönlich bei dir und vereinbaren ein unverbindliches Gespräch." },
  { q: "Wie werde ich eingearbeitet?", a: "Über die ERLEN Academy mit Lektionen, Leitfäden und Wissenstests – begleitet von einem festen Ausbilder aus dem Team." },
  { q: "Wo sehe ich meine Ergebnisse?", a: "Im ERLEN-Mitarbeiterportal: Tages-, Wochen- und Monatsleistung, Ziele, Rankings und Schulungsfortschritt auf einen Blick." },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow" data-reveal>{children}</p>;
}

function Display({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 data-reveal style={{ "--d": "80ms" } as React.CSSProperties} className={`font-display mt-6 text-[2.6rem] font-black uppercase leading-[0.95] tracking-tight text-white sm:text-6xl lg:text-7xl ${className}`}>
      {children}
    </h2>
  );
}

export default function HomePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: SITE.url,
    logo: `${SITE.url}/icon-512.png`,
    description: SITE.description,
    ...(SITE.email ? { email: SITE.email } : {}),
    ...(SITE.phone ? { telephone: SITE.phone } : {}),
    ...(SITE.address ? { address: SITE.address } : {}),
  };
  const ticker = ["Glasfaser", "Photovoltaik", "Strom & Gas", "Training", "Teamgeist", "Leistung", "Karriere", "Wachstum"];
  const contacts = [
    SITE.address ? { icon: MapPin, label: "Standort", value: SITE.address, href: undefined } : null,
    SITE.email ? { icon: Mail, label: "Kontakt", value: SITE.email, href: `mailto:${SITE.email}` } : null,
    SITE.phone ? { icon: Phone, label: "Telefon", value: SITE.phone, href: `tel:${SITE.phone.replace(/[^\d+]/g, "")}` } : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ───────────── HERO ───────────── */}
      <section className="relative isolate flex min-h-[100svh] items-center overflow-hidden">
        <div className="absolute inset-0 -z-30 overflow-hidden">
          <Image src="/login-bg.jpg" alt="" fill priority sizes="100vw" className="hero-img object-cover object-center opacity-55" />
        </div>
        <div className="absolute inset-0 -z-20 bg-gradient-to-b from-[#0b0f1a]/80 via-[#0b0f1a]/55 to-[#0b0f1a]" aria-hidden />
        <div className="grid-bg absolute inset-0 -z-10 opacity-60" aria-hidden />
        <div className="orb absolute -left-32 top-24 -z-10 size-[28rem] rounded-full bg-[#1e2a47]/70" aria-hidden />
        <div className="orb absolute -right-24 bottom-10 -z-10 size-[22rem] rounded-full bg-[#2c3d66]/40" style={{ animationDelay: "-6s" }} aria-hidden />

        <div className="mx-auto w-full max-w-7xl px-5 pb-24 pt-32 text-center sm:px-8 lg:text-left">
          <p className="eyebrow rise"><span className="pulse size-1.5 rounded-full bg-[#c9d6ef]" />Vertriebspartner gesucht · {new Date().getFullYear()}</p>
          <h1 className="font-display mt-8 text-[3rem] font-black uppercase leading-[0.92] tracking-tight text-white sm:text-7xl lg:text-[6.5rem]">
            <span className="rise block" style={{ "--d": "120ms" } as React.CSSProperties}>Verdiene Geld</span>{" "}
            <span className="rise block" style={{ "--d": "220ms" } as React.CSSProperties}>im Vertrieb.</span>{" "}
            <span className="rise text-accent block" style={{ "--d": "340ms" } as React.CSSProperties}>Nicht mit Zeit.</span>
          </h1>
          <p className="rise mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-white/65 sm:text-xl lg:mx-0" style={{ "--d": "460ms" } as React.CSSProperties}>
            Baue dir ein Einkommen auf, das von deiner Leistung abhängt – mit klaren Prozessen, echtem Training und einem Team, das dich nach vorne bringt.
          </p>
          <div className="rise mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start" style={{ "--d": "580ms" } as React.CSSProperties}>
            <a href="#karriere" className="btn-primary">Wege entdecken <ArrowRight className="size-5" /></a>
            <a href="#bewerben" className="btn-light">Direkt bewerben <ArrowRight className="size-5" /></a>
          </div>
          <ul className="rise mt-12 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-white/55 lg:justify-start" style={{ "--d": "700ms" } as React.CSSProperties}>
            {["Ohne Vorerfahrung möglich", "Persönlicher Ausbilder", "Leistungsabhängiges Einkommen"].map((t) => (
              <li key={t} className="flex items-center gap-2"><Check className="size-4 text-[#8aa4c8]" />{t}</li>
            ))}
          </ul>
        </div>
        <a href="#zahlen" aria-label="Weiter nach unten" className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 text-white/40 transition hover:text-white sm:block"><ChevronDown className="size-7 animate-bounce" /></a>
      </section>

      {/* ───────────── LAUFBAND ───────────── */}
      <div className="marquee-wrap overflow-hidden border-y border-white/10 bg-[#0d1220] py-5" aria-hidden>
        <div className="marquee">
          {[...ticker, ...ticker].map((t, i) => (
            <span key={i} className="font-display flex items-center gap-8 px-8 text-xl font-extrabold uppercase tracking-wide text-white/25 sm:text-2xl">
              {t}<span className="size-1.5 rounded-full bg-[#5d7bb0]" />
            </span>
          ))}
        </div>
      </div>

      {/* ───────────── ZAHLEN ───────────── */}
      <section id="zahlen" className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <dl className="grid gap-4 sm:grid-cols-3">
          {SITE.stats.map((s, i) => (
            <div key={s.label} data-reveal style={{ "--d": `${i * 120}ms` } as React.CSSProperties} className="glass shine rounded-[2rem] px-6 py-10 text-center">
              <dd className="font-display text-6xl font-black tracking-tight text-white sm:text-7xl"><CountUp value={s.value} suffix={s.suffix} /></dd>
              <dt className="mt-3 text-xs font-medium uppercase tracking-[0.3em] text-white/45">{s.label}</dt>
            </div>
          ))}
        </dl>
        {SITE.partners.length ? (
          <div className="mt-12 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Wir arbeiten mit</p>
            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
              {SITE.partners.map((p) => <li key={p} className="font-display text-2xl font-extrabold text-white/40">{p}</li>)}
            </ul>
          </div>
        ) : null}
      </section>

      {/* ───────────── ÜBER ───────────── */}
      <section id="ueber" className="scroll-mt-24 relative overflow-hidden py-24 text-center sm:py-32">
        <div className="orb absolute left-1/2 top-1/3 -z-10 size-[30rem] -translate-x-1/2 rounded-full bg-[#1e2a47]/50" aria-hidden />
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <Eyebrow>Über ERLEN</Eyebrow>
          <Display>Hier entscheidet<br /><span className="text-accent">Leistung.</span></Display>
          <p data-reveal style={{ "--d": "160ms" } as React.CSSProperties} className="mx-auto mt-10 max-w-2xl text-xl leading-relaxed text-white/60">
            Kein Chef, der dich klein hält. Keine Limits nach oben. Kein Bullshit. Wir glauben nicht an Lebensläufe, sondern an <strong className="text-white">Einsatz und Potenzial</strong>.
          </p>
          <p data-reveal style={{ "--d": "240ms" } as React.CSSProperties} className="font-display mt-8 text-2xl font-extrabold text-white sm:text-3xl">Wenn du lieferst, verdienst du. Punkt.</p>
          <div className="mt-16 grid gap-4 text-left md:grid-cols-3">
            {PILLARS.map((p, i) => (
              <article key={p.title} data-reveal style={{ "--d": `${i * 120}ms` } as React.CSSProperties} className="glass shine rounded-[2rem] p-8 transition duration-500 hover:-translate-y-1.5">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-[#1e2a47] text-[#c9d6ef] ring-1 ring-white/10"><p.icon className="size-5" /></span>
                <h3 className="font-display mt-6 text-xl font-extrabold uppercase text-white">{p.title}</h3>
                <p className="mt-2 leading-relaxed text-white/55">{p.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── MÄRKTE ───────────── */}
      <section id="maerkte" className="scroll-mt-24 bg-[#0d1220] py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 text-center sm:px-8">
          <Eyebrow>Unsere Märkte</Eyebrow>
          <Display>Dort, wo Kunden<br /><span className="text-accent">echten Nutzen</span> spüren.</Display>
          <p data-reveal className="mx-auto mt-8 max-w-2xl text-lg text-white/55">Telekommunikation und Energie – Produkte, die Haushalte wirklich brauchen. Verständlich, gefragt, zukunftssicher.</p>
          <div className="mt-16 grid gap-5 text-left lg:grid-cols-3">
            {MARKETS.map((m, i) => (
              <article key={m.title} data-reveal="scale" style={{ "--d": `${i * 140}ms` } as React.CSSProperties} className="shine group relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#1e2a47] via-[#121a2e] to-[#0b0f1a] p-8 transition duration-500 hover:-translate-y-1.5 hover:border-white/25">
                <div className="grid-bg absolute inset-0 opacity-70" aria-hidden />
                <m.icon className="absolute -right-6 -top-6 size-48 text-white/[0.04] transition-transform duration-700 group-hover:-rotate-6 group-hover:scale-110" aria-hidden />
                <div className="relative">
                  <p className="eyebrow !text-[0.62rem]">{m.no} — {m.tag}</p>
                  <div className="mt-16 flex size-16 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/15 backdrop-blur"><m.icon className="size-8" /></div>
                  <h3 className="font-display mt-6 text-3xl font-black uppercase text-white">{m.title}</h3>
                  <p className="mt-3 leading-relaxed text-white/60">{m.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── KARRIERE ───────────── */}
      <section id="karriere" className="scroll-mt-24 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="text-center">
            <Eyebrow>Dein Karrierepfad</Eyebrow>
            <Display>Ein System.<br /><span className="text-accent">Dein Aufstieg.</span></Display>
            <p data-reveal className="mx-auto mt-8 max-w-2xl text-lg text-white/55">Bei ERLEN bestimmen deine Ergebnisse, wie schnell du wächst. Jede Stufe bringt mehr Verantwortung – und mehr Möglichkeiten.</p>
          </div>
          <div data-grow-group className="glass mt-16 rounded-[2rem] p-6 sm:p-10">
            <div className="grid grid-cols-4 items-end gap-2 sm:gap-5" style={{ height: "18rem" }}>
              {SITE.careerLevels.map((l, i) => (
                <div key={l.title} className="flex h-full flex-col justify-end">
                  {l.income ? <p className="mb-3 text-center text-xs font-bold text-[#c9d6ef] sm:text-sm">{l.income}</p> : null}
                  <div data-grow style={{ height: `${30 + i * 23}%`, "--d": `${i * 160}ms` } as React.CSSProperties} className="relative rounded-t-3xl bg-gradient-to-t from-[#1e2a47] to-[#5d7bb0] shadow-[0_0_40px_rgba(93,123,176,0.35)]">
                    <span className="font-display absolute inset-x-0 top-4 text-center text-2xl font-black text-white/80 sm:text-4xl">{String(i + 1).padStart(2, "0")}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 sm:gap-5">
              {SITE.careerLevels.map((l) => <p key={l.title} className="text-center text-[0.62rem] font-bold uppercase tracking-[0.12em] text-white/60 sm:text-xs">{l.title}</p>)}
            </div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SITE.careerLevels.map((l, i) => (
              <article key={l.title} data-reveal style={{ "--d": `${i * 100}ms` } as React.CSSProperties} className="rounded-[1.5rem] border border-white/10 bg-white/[0.02] p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#8aa4c8]">Stufe {i + 1}</p>
                <h3 className="font-display mt-2 text-xl font-extrabold uppercase text-white">{l.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{l.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── VORTEILE ───────────── */}
      <section className="bg-[#0d1220] py-24 sm:py-32">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-2">
          <div>
            <Eyebrow>Deine Vorteile</Eyebrow>
            <Display className="!text-5xl sm:!text-6xl">Alles für<br /><span className="text-accent">deinen Erfolg.</span></Display>
            <p data-reveal className="mt-8 max-w-md text-lg text-white/55">Struktur, Ausbildung und Transparenz – damit aus deinem Einsatz messbare Ergebnisse werden.</p>
            <a data-reveal href="#bewerben" className="btn-primary mt-10">Karriere starten <ArrowRight className="size-5" /></a>
          </div>
          <ul className="space-y-3">
            {BENEFITS.map((b, i) => (
              <li key={b} data-reveal="left" style={{ "--d": `${i * 90}ms` } as React.CSSProperties} className="glass flex items-center gap-4 rounded-full px-5 py-4 text-base font-medium text-white sm:text-lg">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#5d7bb0] to-[#1e2a47] ring-1 ring-white/20"><Check className="size-4" /></span>
                {b}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ───────────── QUIZ ───────────── */}
      <section id="quiz" className="scroll-mt-24 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-5 text-center sm:px-8">
          <Eyebrow>Unsicher?</Eyebrow>
          <Display className="!text-4xl sm:!text-6xl">Finde in 60 Sekunden heraus, <span className="text-accent">ob es passt.</span></Display>
          <p data-reveal className="mt-6 text-lg text-white/55">6 kurze Fragen – du bekommst sofort eine ehrliche Einschätzung.</p>
          <div data-reveal="scale" className="mt-12 text-left"><FitQuiz /></div>
        </div>
      </section>

      {/* ───────────── ERFOLGSGESCHICHTEN (nur mit echten Inhalten) ───────────── */}
      {SITE.testimonials.length ? (
        <section className="bg-[#0d1220] py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="text-center"><Eyebrow>Erfolgsgeschichten</Eyebrow><Display>Vorher.<br /><span className="text-accent">Heute.</span></Display></div>
            <div className="mt-16 grid gap-5 lg:grid-cols-3">
              {SITE.testimonials.map((t, i) => (
                <article key={t.name} data-reveal style={{ "--d": `${i * 120}ms` } as React.CSSProperties} className="glass rounded-[2rem] p-8">
                  <div className="flex items-center gap-4">
                    <span className="font-display flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-[#5d7bb0] to-[#1e2a47] text-xl font-black">{t.name.charAt(0)}</span>
                    <div><p className="text-lg font-semibold">{t.name}</p><p className="text-sm text-white/50">{t.duration}</p></div>
                  </div>
                  <dl className="mt-6 space-y-2 text-sm">
                    <div className="flex gap-6"><dt className="w-16 uppercase tracking-widest text-white/40">Vorher</dt><dd className="text-white/50 line-through">{t.before}</dd></div>
                    <div className="flex gap-6"><dt className="w-16 font-semibold uppercase tracking-widest text-[#8aa4c8]">Heute</dt><dd className="font-display text-lg font-extrabold">→ {t.after}</dd></div>
                  </dl>
                  <blockquote className="mt-6 border-l-2 border-[#5d7bb0] pl-4 italic text-white/70">„{t.quote}“</blockquote>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ───────────── ABLAUF ───────────── */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 text-center sm:px-8">
          <Eyebrow>So einfach geht&apos;s</Eyebrow>
          <Display>Vier Schritte.<br /><span className="text-accent">Ein Start.</span></Display>
          <ol className="relative mt-16 grid gap-6 text-left md:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} data-reveal style={{ "--d": `${i * 130}ms` } as React.CSSProperties} className="glass rounded-[2rem] p-7">
                <span className="font-display text-5xl font-black text-white/15">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="font-display mt-4 text-xl font-extrabold uppercase text-white">{s.title}</h3>
                <p className="mt-2 text-white/55">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ───────────── FAQ ───────────── */}
      <section id="faq" className="scroll-mt-24 bg-[#0d1220] py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <div className="text-center"><Eyebrow>FAQ</Eyebrow><Display className="!text-5xl sm:!text-6xl">Häufige <span className="text-accent">Fragen.</span></Display></div>
          <div className="mt-14 space-y-3">
            {FAQ.map((f, i) => (
              <details key={f.q} data-reveal style={{ "--d": `${i * 70}ms` } as React.CSSProperties} className="faq-item glass group rounded-3xl px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-lg font-semibold text-white [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="faq-icon flex size-9 shrink-0 items-center justify-center rounded-full border border-white/15 transition-transform duration-300"><Plus className="size-4" /></span>
                </summary>
                <p className="faq-body mt-3 leading-relaxed text-white/60">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }) }} />
      </section>

      {/* ───────────── BEWERBUNG ───────────── */}
      <section id="bewerben" className="scroll-mt-24 relative isolate overflow-hidden py-24 sm:py-32">
        <div className="orb absolute left-1/4 top-1/4 -z-10 size-[30rem] rounded-full bg-[#1e2a47]/60" aria-hidden />
        <div className="grid-bg absolute inset-0 -z-10 opacity-50" aria-hidden />
        <div className="mx-auto grid max-w-7xl items-start gap-14 px-5 sm:px-8 lg:grid-cols-2">
          <div>
            <Eyebrow>Bewerbung</Eyebrow>
            <Display className="!text-5xl sm:!text-6xl lg:!text-7xl">Jetzt in<br /><span className="text-accent">60 Sekunden</span><br />bewerben.</Display>
            <p data-reveal className="mt-8 max-w-md text-lg text-white/55">Kein Lebenslauf, kein Anschreiben. Hinterlasse deine Kontaktdaten – wir melden uns persönlich bei dir.</p>
            <ul className="mt-8 space-y-3 text-white/70">
              {[{ i: Phone, t: "Persönlicher Rückruf durch unser Team" }, { i: UserRound, t: "Unverbindliches Kennenlerngespräch" }, { i: Users, t: "Start mit Training und festem Ausbilder" }].map((x, k) => (
                <li key={x.t} data-reveal="left" style={{ "--d": `${k * 100}ms` } as React.CSSProperties} className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-full bg-white/10"><x.i className="size-4" /></span>{x.t}</li>
              ))}
            </ul>
            <a href="#termin" data-reveal className="mt-10 inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/50">
              <CalendarDays className="size-4" />Lieber direkt einen Termin für das Gespräch buchen
            </a>
          </div>
          <div data-reveal="scale" className="glass rounded-[2rem] p-6 sm:p-10">
            <ApplyForm />
          </div>
        </div>
      </section>

      {/* ───────────── TERMIN BUCHEN ───────────── */}
      <section id="termin" className="scroll-mt-24 relative isolate overflow-hidden pb-24 sm:pb-32">
        <div className="mx-auto grid max-w-7xl items-start gap-14 px-5 sm:px-8 lg:grid-cols-2">
          <div>
            <Eyebrow>Termin</Eyebrow>
            <Display className="!text-5xl sm:!text-6xl">Dein Gespräch.<br /><span className="text-accent">Dein Termin.</span></Display>
            <p data-reveal className="mt-8 max-w-md text-lg text-white/55">Such dir direkt einen freien Termin für dein Bewerbungsgespräch aus. Du erhältst sofort eine Bestätigung per E-Mail und 2 Stunden vorher eine Erinnerung.</p>
          </div>
          <div data-reveal="scale" className="glass rounded-[2rem] p-6 sm:p-10">
            <BookingCalendar />
            <noscript><p className="text-white/60">Für die Terminbuchung wird JavaScript benötigt. Alternativ: Bewerbungsformular oben nutzen.</p></noscript>
          </div>
        </div>
      </section>

      {/* ───────────── STANDORT / KONTAKT (nur mit echten Daten) ───────────── */}
      {contacts.length ? (
        <section className="pb-24">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <Eyebrow>Kontakt</Eyebrow>
            <Display className="!text-5xl">Hier entsteht<br /><span className="text-accent">Wachstum.</span></Display>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {contacts.map((c) => (
                <a key={c.label} href={c.href} data-reveal className="glass flex items-center gap-5 rounded-[1.5rem] p-6 transition hover:border-white/25">
                  <c.icon className="size-6 text-[#8aa4c8]" />
                  <span><span className="block text-xs uppercase tracking-[0.25em] text-white/45">{c.label}</span><span className="mt-1 block text-lg font-semibold">{c.value}</span></span>
                </a>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
