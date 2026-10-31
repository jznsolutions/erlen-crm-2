"use client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Select } from "@/components/ui/input";
import { saveGongSettings } from "@/app/(portal)/admin/einstellungen/actions";

export function GongSettingsForm({ scope }: { scope: string }) {
  return (
    <ActionForm action={saveGongSettings} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex-1 text-sm">
        <span className="mb-1 block text-muted-foreground">Wer bekommt den Gong?</span>
        <Select name="scope" defaultValue={scope} aria-label="Abschluss-Gong">
          <option value="team">Das eigene Team (empfohlen)</option>
          <option value="agentur">Die ganze Agentur</option>
          <option value="off">Niemand (aus)</option>
        </Select>
      </label>
      <SubmitButton variant="secondary">Speichern</SubmitButton>
    </ActionForm>
  );
}
