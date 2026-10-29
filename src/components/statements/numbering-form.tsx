"use client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui/input";
import { saveNumbering, saveStatementDefaults } from "@/app/(portal)/abrechnungen/actions";

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

export function DefaultsForm({ retention, nextCustomer }: { retention: number; nextCustomer: number }) {
  return (
    <ActionForm action={saveStatementDefaults} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      {({ fieldErrors }) => (
        <>
          <Field label="Stornobehalt (Standard, %)" htmlFor="d-ret" error={fieldErrors.retention_rate}><Input id="d-ret" name="retention_rate" type="number" min={0} max={100} step="0.5" defaultValue={retention} /></Field>
          <Field label="Nächste laufende Nr. für Kundennummern" htmlFor="d-cust" hint="z. B. 8 → VPXX008" error={fieldErrors.next_customer}><Input id="d-cust" name="next_customer" type="number" min={1} defaultValue={nextCustomer} /></Field>
          <SubmitButton variant="secondary">Speichern</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
