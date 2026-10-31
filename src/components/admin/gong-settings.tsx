"use client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Select } from "@/components/ui/input";
import { saveGongSettings, saveWeeklyReviewSettings } from "@/app/(portal)/admin/einstellungen/actions";
import { Checkbox } from "@/components/ui/input";

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

export function WeeklyReviewForm({ enabled }: { enabled: boolean }) {
  return (
    <ActionForm action={saveWeeklyReviewSettings} className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <label className="flex flex-1 items-center gap-2 text-sm">
        <Checkbox name="enabled" defaultChecked={enabled} />
        Freitags ab 16 Uhr jedem Mitarbeiter seinen Wochenrückblick schicken (Abschlüsse, Vergleich zur Vorwoche, Platz, Serie, neue Abzeichen)
      </label>
      <SubmitButton variant="secondary">Speichern</SubmitButton>
    </ActionForm>
  );
}
