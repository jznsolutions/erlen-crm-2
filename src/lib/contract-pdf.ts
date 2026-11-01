import "server-only";
import { createHash } from "node:crypto";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { SITE } from "@/lib/site";

export type SignInput = {
  title: string;
  signedName: string;
  signerEmail: string;
  signaturePng: Uint8Array;
  signedAt: Date;
  requestId: string;
  ipHash: string;
};

const clean = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF€„“‚‘–—…•]/g, "?");
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/**
 * Hängt an die Vertragsvorlage eine Unterschriftsseite an und versieht jede Seite mit einem Vermerk.
 * Liefert das unterschriebene PDF und die Prüfsummen von Vorlage und Ergebnis.
 */
export async function signContractPdf(template: Uint8Array, s: SignInput): Promise<{ pdf: Uint8Array; templateHash: string; signedHash: string }> {
  const templateHash = sha256(template);
  const doc = await PDFDocument.load(template, { updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const sig = await doc.embedPng(s.signaturePng);
  const when = new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "medium", timeZone: "Europe/Berlin" }).format(s.signedAt);

  // Vermerk unten auf jeder Vertragsseite
  for (const page of doc.getPages()) {
    const { width } = page.getSize();
    page.drawText(clean(`Digital unterschrieben von ${s.signedName} am ${when} · Vorgang ${s.requestId.slice(0, 8)}`), {
      x: 30,
      y: 14,
      size: 7,
      font,
      color: rgb(0.45, 0.45, 0.5),
      maxWidth: width - 60,
    });
  }

  // Unterschriftsseite
  const page = doc.addPage([595.28, 841.89]);
  const L = 60;
  let y = 770;
  const line = (t: string, o: { size?: number; b?: boolean; gray?: boolean } = {}) => {
    page.drawText(clean(t), { x: L, y, size: o.size ?? 10.5, font: o.b ? bold : font, color: o.gray ? rgb(0.45, 0.45, 0.5) : rgb(0.07, 0.07, 0.09), maxWidth: 475 });
    y -= (o.size ?? 10.5) + 8;
  };
  line("Unterschriftsseite", { size: 18, b: true });
  y -= 6;
  line(s.title, { size: 12, b: true });
  line(`zwischen ${SITE.legalName} und ${s.signedName}`, { gray: true });
  y -= 14;
  line("Mit meiner Unterschrift bestätige ich, dass ich den vorstehenden Vertrag vollständig gelesen habe und ihm zustimme.");
  y -= 20;
  const w = 220;
  const h = (sig.height / sig.width) * w;
  page.drawImage(sig, { x: L, y: y - h, width: w, height: Math.min(h, 110) });
  y -= Math.min(h, 110) + 6;
  page.drawLine({ start: { x: L, y }, end: { x: L + 260, y }, thickness: 0.8, color: rgb(0.2, 0.2, 0.25) });
  y -= 16;
  line(s.signedName, { b: true });
  line(`Unterschrieben am ${when} (Zeitzone Europe/Berlin)`, { gray: true });
  y -= 24;
  line("Nachweis", { size: 12, b: true });
  for (const t of [
    `Konto (Anmelde-E-Mail): ${s.signerEmail}`,
    `Vorgang: ${s.requestId}`,
    `Prüfsumme der Vertragsvorlage (SHA-256): ${templateHash}`,
    `Herkunft (anonymisiert): ${s.ipHash}`,
    "Unterschrieben über das ERLEN-Portal nach Anmeldung mit persönlichem Konto.",
  ]) line(t, { size: 8.5, gray: true });

  doc.setProducer("ERLEN Portal");
  doc.setModificationDate(s.signedAt);
  const pdf = await doc.save();
  return { pdf, templateHash, signedHash: sha256(pdf) };
}

/** Unterschrift aus einer data:-URL (PNG) lesen und prüfen. */
export function parseSignature(dataUrl: string): Uint8Array | null {
  const m = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length < 200 || bytes.length > 400_000) return null;
  // PNG-Signatur
  if (!(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)) return null;
  return new Uint8Array(bytes);
}
