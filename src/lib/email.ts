import "server-only";
import nodemailer from "nodemailer";
import { SITE } from "@/lib/site";

// E-Mail-Versand über einen eigenen SMTP-Server (z. B. das Postfach von erlen-sales.de)
// oder über Resend. Zugangsdaten stehen ausschließlich in den Vercel-Umgebungsvariablen.

export type EmailProvider = "graph" | "smtp" | "resend" | null;

// Umgebungsvariable ohne versehentlich mitkopierte Leerzeichen, Zeilenumbrüche oder Anführungszeichen
const env = (name: string) => process.env[name]?.trim().replace(/^["']|["']$/g, "").trim() || undefined;

export function emailProvider(): EmailProvider {
  // Microsoft 365 / Outlook über die Microsoft-Graph-Schnittstelle (empfohlen für Outlook-Postfächer)
  if (env("MS_TENANT_ID") && env("MS_CLIENT_ID") && env("MS_CLIENT_SECRET") && env("EMAIL_FROM")) return "graph";
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  return null;
}

function sender() {
  return env("EMAIL_FROM") || env("SMTP_USER") || "";
}

export type EmailAttachment = { filename: string; content: string; contentType: string };

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

/** Reine Adresse aus "Name <adresse>". */
function addressOf(from: string) {
  return from.match(/<([^>]+)>/)?.[1] ?? from.trim();
}

let graphToken: { value: string; expires: number } | null = null;

async function graphAccessToken(): Promise<string> {
  if (graphToken && graphToken.expires > Date.now() + 60_000) return graphToken.value;
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(env("MS_TENANT_ID")!)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("MS_CLIENT_ID")!,
      client_secret: env("MS_CLIENT_SECRET")!,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error_description?: string };
    throw new Error(`MS_TOKEN ${res.status} ${body.error_description?.split("\r\n")[0] ?? ""}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  graphToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function sendViaGraph(msg: EmailMessage) {
  const from = addressOf(sender());
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await graphAccessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: msg.subject,
        body: msg.html ? { contentType: "HTML", content: msg.html } : { contentType: "Text", content: msg.text },
        toRecipients: [{ emailAddress: { address: msg.to } }],
        replyTo: msg.replyTo ? [{ emailAddress: { address: msg.replyTo } }] : undefined,
        attachments: msg.attachments?.map((a) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: a.filename,
          contentType: a.contentType,
          contentBytes: Buffer.from(a.content, "utf8").toString("base64"),
        })),
      },
      saveToSentItems: true,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    throw new Error(`MS_GRAPH ${res.status} ${body.error?.code ?? ""} ${body.error?.message ?? ""}`);
  }
}

/** Versendet eine E-Mail. Gibt false zurück, wenn kein Versand eingerichtet ist oder er fehlschlägt. */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  return (await sendEmailResult(msg)).ok;
}

/** Wie sendEmail, liefert aber im Fehlerfall die technische Ursache (für den Test im Portal). */
export async function sendEmailResult(msg: EmailMessage): Promise<{ ok: true } | { ok: false; error: string }> {
  const provider = emailProvider();
  if (!provider) return { ok: false, error: "NOT_CONFIGURED" };
  try {
    if (provider === "graph") {
      await sendViaGraph(msg);
      return { ok: true };
    }
    if (provider === "smtp") {
      const port = Number(process.env.SMTP_PORT || 465);
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        connectionTimeout: 15_000,
      });
      await transport.sendMail({
        from: sender(),
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        replyTo: msg.replyTo,
        attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
      });
      return { ok: true };
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: sender(),
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        reply_to: msg.replyTo,
        attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content, "utf8").toString("base64") })),
      }),
    });
    if (!res.ok) {
      console.error("[email] Resend", res.status);
      return { ok: false, error: `RESEND ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    const error = (e as Error).message;
    console.error("[email]", error);
    return { ok: false, error };
  }
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Einheitliches, dunkles E-Mail-Layout im Stil der Website. */
export function layout(title: string, bodyHtml: string, button?: { label: string; href: string }) {
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

/** Übersetzt technische Fehler des Mailversands in einen verständlichen Hinweis. */
export function explainEmailError(error: string): string {
  if (error === "NOT_CONFIGURED") return "In Vercel sind noch keine E-Mail-Zugangsdaten eingetragen (oder nach dem Eintragen wurde kein „Redeploy“ gemacht).";
  if (/AADSTS7000215|AADSTS7000222/.test(error)) return "Der geheime Clientschlüssel (MS_CLIENT_SECRET) ist falsch oder abgelaufen. Achtung: Es muss der „Wert“ kopiert werden, nicht die „Geheime ID“.";
  if (/AADSTS700016/.test(error)) return "Die Anwendungs-ID (MS_CLIENT_ID) wurde nicht gefunden. Bitte prüfen, ob sie vollständig kopiert wurde und zur richtigen Organisation gehört.";
  if (/AADSTS90002|AADSTS900023/.test(error)) return "Die Verzeichnis-ID (MS_TENANT_ID) ist falsch. Bitte erneut aus der Übersicht der App-Registrierung kopieren.";
  if (/MS_TOKEN/.test(error)) return "Die Anmeldung bei Microsoft ist fehlgeschlagen. Bitte MS_TENANT_ID, MS_CLIENT_ID und MS_CLIENT_SECRET prüfen.";
  if (/MS_GRAPH 403|ErrorAccessDenied|Authorization_RequestDenied/.test(error)) return "Microsoft verweigert den Versand: Die Berechtigung „Mail.Send“ (Anwendungsberechtigung) fehlt oder die „Administratorzustimmung“ wurde nicht erteilt.";
  if (/MS_GRAPH 404|ErrorInvalidUser|MailboxNotEnabledForRESTAPI|ResourceNotFound/.test(error)) return "Das Absender-Postfach wurde nicht gefunden. Bitte EMAIL_FROM prüfen – es muss genau kontakt@erlen-sales.de enthalten sein und das Postfach muss eine Microsoft-365-Lizenz haben.";
  if (/5\.7\.139|SmtpClientAuthentication|Authentication unsuccessful|535/.test(error)) return "Outlook lehnt die Anmeldung per Passwort ab. „Authentifiziertes SMTP“ ist für das Postfach ausgeschaltet oder durch die Sicherheitsstandards gesperrt – bitte Weg A (Microsoft Graph) nutzen.";
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND/.test(error)) return "Der Mailserver ist nicht erreichbar. Bitte SMTP_HOST (smtp.office365.com) und SMTP_PORT (587) prüfen.";
  return "Unbekannter Fehler beim Versand: " + error.slice(0, 200);
}

export function applicationEmails(opts: { name: string; email: string; phone: string; message?: string | null; bookingLink: string; portalLink: string }) {
  const first = opts.name.split(" ")[0];
  const applicant: Omit<EmailMessage, "to"> = {
    subject: "Deine Einladung zum Bewerbungsgespräch bei ERLEN",
    text:
      `Hallo ${first},\n\nvielen Dank für deine Bewerbung bei ERLEN! Wir laden dich herzlich zu einem unverbindlichen Kennenlerngespräch ein.\n\n` +
      `Such dir hier direkt einen passenden Termin aus:\n${opts.bookingLink}\n\nDu kannst auch einfach auf diese E-Mail antworten – wir melden uns in jedem Fall persönlich bei dir.\n\nViele Grüße\nDein ERLEN-Team`,
    html: layout(
      `Hallo ${first}, schön, dass du dabei sein willst!`,
      `Vielen Dank für deine Bewerbung bei ERLEN. Wir laden dich herzlich zu einem unverbindlichen Kennenlerngespräch ein.<br><br>Such dir jetzt direkt einen freien Termin aus – du bekommst sofort eine Bestätigung und 2 Stunden vorher eine Erinnerung.<br><br><span style="color:#7d8aa5;font-size:13px">Fragen? Antworte einfach auf diese E-Mail.</span>`,
      { label: "Termin auswählen", href: opts.bookingLink },
    ),
  };
  const team: Omit<EmailMessage, "to"> = {
    subject: `Neue Bewerbung: ${opts.name}`,
    text: `Neue Bewerbung über die Website:\n\n${opts.name}\n${opts.email}\n${opts.phone}${opts.message ? `\n\nNachricht: ${opts.message}` : ""}\n\nDer Bewerber hat automatisch eine Einladung zum Gespräch erhalten.\nIm Portal: ${opts.portalLink}`,
    html: layout(
      "Neue Bewerbung",
      `<strong style="color:#fff">${esc(opts.name)}</strong><br>E-Mail: ${esc(opts.email)}<br>Telefon: ${esc(opts.phone)}${opts.message ? `<br><br>Nachricht:<br>${esc(opts.message)}` : ""}<br><br><span style="color:#7d8aa5;font-size:13px">Der Bewerber hat automatisch eine Einladung zum Gespräch mit Terminlink erhalten.</span>`,
      { label: "Im Portal ansehen", href: opts.portalLink },
    ),
    replyTo: opts.email,
  };
  return { applicant, team };
}
