"use client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Select, Textarea } from "@/components/ui/input";
import { updateApplicant } from "@/app/(portal)/bewerber/actions";

export function ApplicantForm({ id, status, notes }: { id: string; status: string; notes: string | null }) {
  return (
    <ActionForm action={updateApplicant} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <Select name="status" defaultValue={status} className="h-9 text-sm" aria-label="Status">
        <option value="neu">Neu</option><option value="kontaktiert">Kontaktiert</option><option value="gespraech">Gespräch vereinbart</option><option value="angenommen">Angenommen</option><option value="abgelehnt">Abgelehnt</option>
      </Select>
      <Textarea name="notes" defaultValue={notes ?? ""} rows={2} placeholder="Interne Notiz" className="text-sm" aria-label="Notiz" />
      <SubmitButton size="sm" variant="secondary">Speichern</SubmitButton>
    </ActionForm>
  );
}
