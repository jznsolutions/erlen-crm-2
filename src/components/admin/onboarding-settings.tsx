"use client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Checkbox } from "@/components/ui/input";
import { DOC_CATEGORIES } from "@/lib/employee-docs";
import { saveOnboardingSettings } from "@/app/(portal)/admin/einstellungen/actions";

export function OnboardingSettingsForm({ required }: { required: string[] }) {
  return (
    <ActionForm action={saveOnboardingSettings} className="space-y-4">
      <p className="text-sm text-muted-foreground">Diese Unterlagen müssen neue Mitarbeiter in der Start-Checkliste hochladen:</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {DOC_CATEGORIES.filter((c) => c.key !== "sonstiges").map((c) => (
          <label key={c.key} className="flex items-center gap-2 text-sm">
            <Checkbox name="required_documents" value={c.key} defaultChecked={required.includes(c.key)} />
            {c.label}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Außerdem immer in der Checkliste: Profilbild, Telefonnummer, Anschrift, IBAN, Steuernummer/USt-IdNr. und Pflichtschulungen; Push-Benachrichtigungen als Empfehlung.</p>
      <SubmitButton variant="secondary">Speichern</SubmitButton>
    </ActionForm>
  );
}
