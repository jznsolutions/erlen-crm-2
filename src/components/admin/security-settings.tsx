"use client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Checkbox } from "@/components/ui/input";
import { ROLE_LABELS, type RoleKey } from "@/lib/permissions";
import { saveSecuritySettings } from "@/app/(portal)/admin/einstellungen/actions";

const ROLES: RoleKey[] = ["admin", "agenturleiter", "teamleiter", "ausbilder", "vertriebspartner"];

export function SecuritySettingsForm({ required }: { required: string[] }) {
  return (
    <ActionForm action={saveSecuritySettings} className="space-y-4">
      <p className="text-sm text-muted-foreground">Für diese Rollen ist die Zwei-Faktor-Anmeldung Pflicht. Wer sie noch nicht hat, wird bei der nächsten Anmeldung durch die Einrichtung geführt.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {ROLES.map((r) => (
          <label key={r} className="flex items-center gap-2 text-sm">
            <Checkbox name="mfa_required_roles" value={r} defaultChecked={required.includes(r)} />
            {ROLE_LABELS[r]}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Empfehlung: mindestens Systemadministrator und Agenturleiter. Richte die Zwei-Faktor-Anmeldung vorher im eigenen Profil ein. Freiwillig einrichten kann sie jeder im Profil.</p>
      <SubmitButton variant="secondary">Speichern</SubmitButton>
    </ActionForm>
  );
}
