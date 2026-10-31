"use client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Select, Textarea } from "@/components/ui/input";
import { updateApplicant } from "@/app/(portal)/bewerber/actions";
import { APPLICANT_LABELS, APPLICANT_STATUSES } from "@/lib/applicants";

export function ApplicantForm({ id, status, notes, onSaved }: { id: string; status: string; notes: string | null; onSaved?: () => void }) {
  return (
    <ActionForm action={updateApplicant} className="space-y-2" onSuccess={onSaved}>
      <input type="hidden" name="id" value={id} />
      <Select name="status" defaultValue={status} className="h-9 text-sm" aria-label="Status">
        {APPLICANT_STATUSES.map((s) => <option key={s} value={s}>{APPLICANT_LABELS[s]}</option>)}
      </Select>
      <Textarea name="notes" defaultValue={notes ?? ""} rows={3} placeholder="Interne Notiz (z. B. Eindruck aus dem Gespräch)" className="text-sm" aria-label="Notiz" />
      <SubmitButton size="sm" variant="secondary">Speichern</SubmitButton>
    </ActionForm>
  );
}
