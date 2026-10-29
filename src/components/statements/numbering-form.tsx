"use client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui/input";
import { saveNumbering } from "@/app/(portal)/abrechnungen/actions";

export function NumberingForm({ kind, format, pad, next, example }: { kind: "gutschrift" | "abrechnung"; format: string; pad: number; next: number; example: string }) {
  return (
    <ActionForm action={saveNumbering} className="grid gap-3 sm:grid-cols-[1.2fr_0.7fr_0.8fr_auto] sm:items-end">
      {({ fieldErrors }) => (
        <>
          <input type="hidden" name="kind" value={kind} />
          <Field label={kind === "gutschrift" ? "Format Gutschrift" : "Format Abrechnung"} htmlFor={`nf-${kind}`} hint={`Nächste Nummer: ${example}`} error={fieldErrors.format}>
            <Input id={`nf-${kind}`} name="format" defaultValue={format} className="font-mono" />
          </Field>
          <Field label="Stellen" htmlFor={`np-${kind}`} hint="z. B. 2 → 07" error={fieldErrors.pad}><Input id={`np-${kind}`} name="pad" type="number" min={1} max={8} defaultValue={pad} /></Field>
          <Field label="Nächste Nr." htmlFor={`nn-${kind}`} error={fieldErrors.next_number}><Input id={`nn-${kind}`} name="next_number" type="number" min={1} defaultValue={next} /></Field>
          <SubmitButton variant="secondary">Speichern</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
