import { SiteFooter } from "@/components/website/footer";
import { SiteHeader } from "@/components/website/header";
import { SITE } from "@/lib/site";
import { RevealObserver } from "@/components/website/reveal";
import { StickyCta } from "@/components/website/sticky-cta";
import "./website.css";

export default function WebsiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh overflow-x-clip bg-[#0b0f1a] text-white antialiased">
      {/* Animationen nur aktivieren, wenn JavaScript läuft (ohne JS bleiben alle Inhalte sichtbar) */}
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      <a href="#inhalt" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-[#0b0f1a]">Zum Inhalt springen</a>
      <SiteHeader />
      <main id="inhalt">{children}</main>
      <SiteFooter />
      <RevealObserver />
      <StickyCta />
      {SITE.whatsapp ? (
        <a href={`https://wa.me/${SITE.whatsapp}`} target="_blank" rel="noopener noreferrer" aria-label="Per WhatsApp schreiben" className="fixed bottom-24 right-5 z-40 sm:bottom-5 flex size-14 items-center justify-center rounded-full bg-[#1e2a47] text-white shadow-[0_0_24px_rgba(30,42,71,0.8)] transition hover:scale-105">
          <svg viewBox="0 0 24 24" className="size-7" fill="currentColor" aria-hidden><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2l-.4-.2Z" /></svg>
        </a>
      ) : null}
    </div>
  );
}
