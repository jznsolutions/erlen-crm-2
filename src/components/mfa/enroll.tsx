"use client";
import { useState, useTransition } from "react";
import { Copy, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui/input";
import { confirmMfaEnrollment, startMfaEnrollment, type Enrollment } from "@/lib/mfa-actions";

export function MfaEnroll({ weiter, another = false }: { weiter: string; another?: boolean }) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const [pending, start] = useTransition();

  const begin = () =>
    start(async () => {
      setError(null);
      const r = await startMfaEnrollment(deviceName);
      if (r.ok) setEnrollment(r.enrollment);
      else setError(r.error);
    });

  if (!enrollment) {
    return (
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Installiere auf {another ? "dem neuen" : "deinem"} Handy eine Authenticator-App, z. B. <b>Microsoft Authenticator</b> oder <b>Google Authenticator</b> (kostenlos im App Store / Play Store).</li>
          <li>Gib dem Gerät einen Namen, damit ihr es später wiedererkennt.</li>
          <li>Tippe dann auf „Einrichtung starten“.</li>
        </ol>
        <Field label="Name des Geräts" htmlFor="device-name">
          <Input id="device-name" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} maxLength={40} placeholder={another ? "z. B. Handy Eren" : "z. B. Mein iPhone"} />
        </Field>
        <Button className="w-full" size="lg" onClick={begin} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Einrichtung starten
        </Button>
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      toast.success("Schlüssel kopiert");
    } catch {
      toast.error("Kopieren nicht möglich – bitte abtippen.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2 text-sm">
        <p className="font-medium">1. Konto in der App hinzufügen</p>
        <p className="text-muted-foreground"><b>Am Computer:</b> In der App auf „+“ bzw. „Konto hinzufügen“ tippen und diesen QR-Code scannen:</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={enrollment.qr} alt="QR-Code für die Authenticator-App" className="mx-auto h-48 w-48 rounded-xl bg-white p-2" />
        <p className="text-muted-foreground"><b>Am Handy:</b> Auf den Knopf tippen – die App öffnet sich und übernimmt das Konto.</p>
        <a href={enrollment.uri} className="flex w-full items-center justify-center gap-2 rounded-full border border-input px-4 py-2.5 text-sm font-medium hover:bg-white/[0.08]">
          <ExternalLink className="size-4" /> In Authenticator-App öffnen
        </a>
        <p className="text-muted-foreground">Klappt beides nicht? In der App „Schlüssel manuell eingeben“ wählen und diesen Schlüssel eintragen:</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-lg bg-white/5 px-3 py-2 font-mono text-xs" data-testid="mfa-secret">{enrollment.secret}</code>
          <Button type="button" variant="secondary" size="sm" onClick={copy} aria-label="Schlüssel kopieren"><Copy /></Button>
        </div>
      </div>
      <ActionForm action={confirmMfaEnrollment} className="space-y-3">
        {({ fieldErrors }) => (
          <>
            <p className="text-sm font-medium">2. Den 6-stelligen Code aus der App eingeben</p>
            <input type="hidden" name="factor_id" value={enrollment.factorId} />
            <input type="hidden" name="weiter" value={weiter} />
            <Field label="Code" htmlFor="code" error={fieldErrors.code}>
              <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required className="text-center text-lg tracking-[0.4em]" placeholder="123456" />
            </Field>
            <SubmitButton className="w-full" size="lg" pendingText="Wird geprüft …">Einrichtung abschließen</SubmitButton>
          </>
        )}
      </ActionForm>
    </div>
  );
}
