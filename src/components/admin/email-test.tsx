"use client";
import { useState, useTransition } from "react";
import { Loader2, MailCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { sendTestEmail } from "@/app/(portal)/admin/einstellungen/actions";

export function EmailTest({ provider, from, replyTo, to }: { provider: string | null; from: string | null; replyTo?: string | null; to: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const label = provider === "graph" ? "Microsoft 365 / Outlook (Microsoft Graph)" : provider === "smtp" ? "SMTP" : provider === "resend" ? "Resend" : null;
  return (
    <div className="space-y-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Versandweg</dt><dd className="font-medium">{label ?? "noch nicht eingerichtet"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Absender</dt><dd className="font-medium">{from ?? "–"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Antworten gehen an</dt><dd className="font-medium">{replyTo ?? "an den Absender"}</dd></div>
      </dl>
      {provider === "graph" ? (
        <p className="text-xs text-muted-foreground">
          Den Namen, den Empfänger im Postfach sehen, legt Microsoft fest: Es ist der Anzeigename des Absender-Postfachs im Microsoft-365-Admin. Für „ERLEN Vertriebsagentur“ statt eines Personennamens ein eigenes Postfach verwenden (Anleitung: docs/ANLEITUNG_OUTLOOK_EMAIL.md, Teil 4).
        </p>
      ) : null}
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await sendTestEmail();
            setResult(r.ok ? { ok: true, text: r.message ?? "Gesendet" } : { ok: false, text: r.error });
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Send />}
        Test-E-Mail an {to} senden
      </Button>
      {result ? (
        <Alert tone={result.ok ? "success" : "danger"} title={result.ok ? "Hat geklappt!" : "Das hat noch nicht geklappt"}>
          {result.ok ? <span className="flex items-center gap-2"><MailCheck className="size-4" />{result.text}</span> : result.text}
        </Alert>
      ) : null}
    </div>
  );
}
