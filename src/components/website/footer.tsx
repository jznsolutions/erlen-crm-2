import Image from "next/image";
import Link from "next/link";
import { SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#070a12]">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Image src="/erlen-logo.png" alt="ERLEN Vertriebsagentur" width={150} height={42} />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/50">Vertrieb mit klaren Prozessen, starkem Training und einem Einkommen, das von deiner Leistung abhängt.</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Website</p>
          <ul className="mt-4 space-y-2.5 text-sm text-white/55">
            <li><Link href="/#warum-erlen" className="hover:text-white">Warum ERLEN</Link></li>
            <li><Link href="/#ablauf" className="hover:text-white">Dein Weg</Link></li>
            <li><Link href="/#faq" className="hover:text-white">FAQ</Link></li>
            <li><Link href="/#bewerben" className="hover:text-white">Bewerben</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Kontakt & Rechtliches</p>
          <ul className="mt-4 space-y-2.5 text-sm text-white/55">
            {SITE.email ? <li><a href={`mailto:${SITE.email}`} className="hover:text-white">{SITE.email}</a></li> : null}
            {SITE.whatsapp ? <li><a href={`https://wa.me/${SITE.whatsapp}`} target="_blank" rel="noopener noreferrer" className="hover:text-white">WhatsApp</a></li> : null}
            <li><Link href="/impressum" className="hover:text-white">Impressum</Link></li>
            <li><Link href="/datenschutz" className="hover:text-white">Datenschutz</Link></li>
            <li><Link href="/login" className="hover:text-white">Mitarbeiter-Login</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/5 py-6 text-center text-xs text-white/35">© {new Date().getFullYear()} {SITE.name}</div>
    </footer>
  );
}
