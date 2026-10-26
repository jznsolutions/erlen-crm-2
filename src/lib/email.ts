import "server-only";
import nodemailer from "nodemailer";
import { SITE } from "@/lib/site";

// E-Mail-Versand über einen eigenen SMTP-Server (z. B. das Postfach von erlen-sales.de)
// oder über Resend. Zugangsdaten stehen ausschließlich in den Vercel-Umgebungsvariablen.

export type EmailProvider = "smtp" | "resend" | null;

export function emailProvider(): EmailProvider {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  return null;
}

function sender() {
  return process.env.EMAIL_FROM || process.env.SMTP_USER || "";
}

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

/** Versendet eine E-Mail. Gibt false zurück, wenn kein Versand eingerichtet ist oder er fehlschlägt. */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  const provider = emailProvider();
  if (!provider) return false;
  try {
    if (provider === "smtp") {
      const port = Number(process.env.SMTP_PORT || 465);
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        connectionTimeout: 15_000,
      });
      await transport.sendMail({ from: sender(), to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, replyTo: msg.replyTo });
      return true;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: sender(), to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html, reply_to: msg.replyTo }),
    });
    if (!res.ok) console.error("[email] Resend", res.status);
    return res.ok;
  } catch (e) {
    console.error("[email]", (e as Error).message);
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Einheitliches, dunkles E-Mail-Layout im Stil der Website. */
function layout(title: string, bodyHtml: string, button?: { label: string; href: string }) {
  const btn = button
    ? `<tr><td style="padding:8px 0 24px"><a href="${esc(button.href)}" style="display:inline-block;background:#ffffff;color:#0b0f1a;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:999px">${esc(button.label)}</a></td></tr>`
    : "";
  return `<!doctype html><html lang="de"><body style="margin:0;background:#0b0f1a;font-family:Arial,Helvetica,sans-serif;color:#e6ebf5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f1a;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#121a2e;border:1px solid #23304d;border-radius:20px;padding:32px">
<tr><td style="font-size:13px;letter-spacing:3px;color:#8aa4c8;font-weight:700;padding-bottom:16px">ERLEN</td></tr>
<tr><td style="font-size:24px;font-weight:700;color:#ffffff;padding-bottom:16px">${esc(title)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;color:#c9d3e6;padding-bottom:24px">${bodyHtml}</td></tr>
${btn}
<tr><td style="font-size:12px;line-height:1.5;color:#7d8aa5;border-top:1px solid #23304d;padding-top:16px">${esc(SITE.legalName)} · ${esc(SITE.address ?? "")}<br>Diese E-Mail wurde automatisch versendet.</td></tr>
</table></td></tr></table></body></html>`;
}

export function invitationEmail(opts: { firstName: string; inviter: string; link: string; validHours: number }): Omit<EmailMessage, "to"> {
  const validity = opts.validHours >= 48 ? `${Math.round(opts.validHours / 24)} Tage` : `${opts.validHours} Stunden`;
  const subject = "Willkommen bei ERLEN – richte dein Konto ein";
  const text =
    `Hallo ${opts.firstName},\n\n${opts.inviter} hat dich in das Mitarbeiterportal von ERLEN eingeladen.\n\n` +
    `Klicke auf den folgenden Link, um dein Passwort festzulegen und dein Konto zu aktivieren (gültig ${validity}, nur einmal verwendbar):\n${opts.link}\n\n` +
    `Falls du diese E-Mail nicht erwartet hast, kannst du sie ignorieren.\n\nViele Grüße\nDein ERLEN-Team`;
  const html = layout(
    `Willkommen, ${opts.firstName}!`,
    `${esc(opts.inviter)} hat dich in das Mitarbeiterportal von ERLEN eingeladen.<br><br>Lege jetzt dein Passwort fest – danach hast du sofort Zugriff auf deine Leistungen, Ziele, Schulungen und Abrechnungen.<br><br><span style="color:#7d8aa5;font-size:13px">Der Button ist ${validity} gültig und nur einmal verwendbar. Falls du diese E-Mail nicht erwartet hast, kannst du sie ignorieren.</span>`,
    { label: "Konto jetzt einrichten", href: opts.link },
  );
  return { subject, text, html };
}

export function statementEmail(opts: { firstName: string; kind: "abrechnung" | "gutschrift"; title: string; link: string }): Omit<EmailMessage, "to"> {
  const what = opts.kind === "abrechnung" ? "eine neue Abrechnung" : "eine neue Gutschrift";
  const subject = opts.kind === "abrechnung" ? "Neue Abrechnung im ERLEN-Portal" : "Neue Gutschrift im ERLEN-Portal";
  const text = `Hallo ${opts.firstName},\n\nim ERLEN-Portal liegt ${what} für dich bereit: ${opts.title}\n\nAbrufen: ${opts.link}\n\nViele Grüße\nDein ERLEN-Team`;
  const html = layout(subject, `Hallo ${esc(opts.firstName)},<br><br>im Portal liegt ${what} für dich bereit:<br><strong style="color:#fff">${esc(opts.title)}</strong>`, {
    label: "Im Portal öffnen",
    href: opts.link,
  });
  return { subject, text, html };
}
