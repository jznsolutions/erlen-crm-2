"use client";
import { Copy, Download, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Empfehlungslink teilen: kopieren, WhatsApp, System-Teilen, QR-Code herunterladen. */
export function ReferralShare({ link, qrSvg, firstName }: { link: string; qrSvg: string; firstName: string }) {
  const text = `Hey! Ich arbeite bei ERLEN im Vertrieb – verdiene Geld nach Leistung, nicht nach Zeit. Bewirb dich hier in 60 Sekunden: ${link}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link kopiert");
    } catch {
      toast.error("Kopieren nicht möglich – bitte den Link markieren.");
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Bewirb dich bei ERLEN", text, url: link });
      } catch {
        /* abgebrochen */
      }
    } else copy();
  };
  const downloadQr = () => {
    const url = URL.createObjectURL(new Blob([qrSvg], { type: "image/svg+xml" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `ERLEN-Empfehlung-${firstName}.svg` });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0 space-y-3">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-2 pl-3">
          <code className="min-w-0 flex-1 truncate text-sm" data-testid="referral-link">{link}</code>
          <Button size="sm" variant="secondary" onClick={copy}><Copy />Kopieren</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" asChild>
            <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"><MessageCircle />Per WhatsApp teilen</a>
          </Button>
          <Button size="sm" variant="secondary" onClick={share}><Share2 />Teilen …</Button>
          <Button size="sm" variant="secondary" onClick={downloadQr}><Download />QR-Code speichern</Button>
        </div>
        <p className="text-xs text-muted-foreground">Wer sich über deinen Link bewirbt oder einen Termin bucht, wird dir automatisch zugeordnet – nach dem Start gibt’s die Vermittlungsprovision.</p>
      </div>
      <div className="mx-auto w-40 rounded-2xl bg-white p-2.5 shadow-[0_10px_40px_-10px_#7c5cff]" aria-label="QR-Code mit deinem Empfehlungslink" role="img" dangerouslySetInnerHTML={{ __html: qrSvg }} />
    </div>
  );
}
