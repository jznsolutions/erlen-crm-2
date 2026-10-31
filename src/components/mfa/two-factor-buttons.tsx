"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/forms";
import { disableOwnMfa, removeOwnDevice, resetUserMfa } from "@/lib/mfa-actions";

export function DisableMfaButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() => {
        if (!confirm("Zwei-Faktor-Anmeldung wirklich abschalten? Alle Geräte werden entfernt, dein Konto ist dann nur noch mit dem Passwort geschützt.")) return;
        start(async () => {
          const r = await disableOwnMfa();
          if (r.ok) toast.success(r.message ?? "Abgeschaltet");
          else toast.error(r.error);
          router.refresh();
        });
      }}
    >
      Ganz abschalten
    </Button>
  );
}

export function RemoveDeviceButton({ factorId, name, last }: { factorId: string; name: string; last: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={`${name} entfernen`}
      onClick={() => {
        const text = last
          ? `„${name}“ entfernen? Es ist das letzte Gerät – danach ist die Zwei-Faktor-Anmeldung aus.`
          : `„${name}“ entfernen? Mit diesem Handy kann man sich dann nicht mehr anmelden.`;
        if (!confirm(text)) return;
        start(async () => {
          const r = await removeOwnDevice(factorId);
          if (r.ok) toast.success(r.message ?? "Entfernt");
          else toast.error(r.error);
          router.refresh();
        });
      }}
    >
      Entfernen
    </Button>
  );
}

export function ResetMfaButton({ userId }: { userId: string }) {
  return (
    <ConfirmAction
      action={resetUserMfa}
      hidden={{ user_id: userId }}
      trigger={<Button variant="secondary">Zurücksetzen</Button>}
      title="Zwei-Faktor-Anmeldung zurücksetzen?"
      description="Die Person meldet sich danach nur mit dem Passwort an und richtet die App neu ein (Pflicht, falls für die Rolle eingeschaltet). Nur tun, wenn du sicher bist, dass die Anfrage wirklich von der Person kommt."
      confirmLabel="Zurücksetzen"
      tone="danger"
    />
  );
}
