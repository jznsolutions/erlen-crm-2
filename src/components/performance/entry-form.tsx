"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert } from "@/components/ui/misc";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { createPerformance } from "@/app/(portal)/leistungen/actions";

type Option = { id: string; label: string };
type Product = { id: string; name: string; unit_label: string; requires_external_ref: boolean };

export function PerformanceEntryForm({
  employees,
  products,
  defaultUserId,
  today,
  canApproveOthers,
}: {
  employees: Option[] | null; // null = nur für sich selbst
  products: Product[];
  defaultUserId: string;
  today: string;
  canApproveOthers: boolean;
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [userId, setUserId] = useState(defaultUserId);
  const [key, setKey] = useState(0);
  const product = products.find((p) => p.id === productId);
  const forOther = userId !== defaultUserId;

  return (
    <ActionForm key={key} action={createPerformance} onSuccess={() => setKey((k) => k + 1)} className="space-y-5">
      {({ fieldErrors, result }) => (
        <>
          {employees ? (
            <Field label="Mitarbeiter" htmlFor="user_id" error={fieldErrors.user_id}>
              <Select id="user_id" name="user_id" value={userId} onChange={(e) => setUserId(e.target.value)}>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </Select>
            </Field>
          ) : (
            <input type="hidden" name="user_id" value={defaultUserId} />
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Produkt" htmlFor="product_id" error={fieldErrors.product_id}>
              <Select id="product_id" name="product_id" value={productId} onChange={(e) => setProductId(e.target.value)} required>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Datum" htmlFor="occurred_on" error={fieldErrors.occurred_on}>
              <Input id="occurred_on" name="occurred_on" type="date" defaultValue={today} max={today} required />
            </Field>
            <Field label={`Menge (${product?.unit_label ?? "Stück"})`} htmlFor="quantity" error={fieldErrors.quantity}>
              <Input id="quantity" name="quantity" type="number" inputMode="numeric" min={1} max={1000} defaultValue={1} required />
            </Field>
            <Field
              label={`Vorgangs-ID${product?.requires_external_ref ? " *" : " (optional)"}`}
              htmlFor="external_ref"
              hint="z. B. Auftrags- oder Vertragsnummer – verhindert Doppelerfassungen"
              error={fieldErrors.external_ref}
            >
              <Input id="external_ref" name="external_ref" maxLength={120} required={product?.requires_external_ref} />
            </Field>
          </div>
          <Field label="Notiz (optional)" htmlFor="note" error={fieldErrors.note}>
            <Textarea id="note" name="note" maxLength={1000} rows={2} />
          </Field>

          {result && !result.ok && result.code === "DUPLIKAT_VERDACHT" ? (
            <Alert tone="warning" title="Mögliche Doppelerfassung">
              <label className="mt-2 flex items-center gap-2">
                <Checkbox name="confirm_duplicate" /> Es handelt sich um eine weitere, eigenständige Leistung – trotzdem speichern.
              </label>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
            <SubmitButton name="submit" value="true">{forOther && canApproveOthers ? "Erfassen & bestätigen" : "Einreichen"}</SubmitButton>
            <SubmitButton variant="secondary" name="submit" value="false">Als Entwurf speichern</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
