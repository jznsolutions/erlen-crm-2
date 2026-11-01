"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { toast } from "sonner";
import { confetti } from "@/lib/confetti";
import { Alert } from "@/components/ui/misc";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { createPerformance } from "@/app/(portal)/leistungen/actions";
import { QuickEntry } from "@/components/performance/quick-entry";
import { addDays } from "@/lib/dates";
import type { ParsedEntry } from "@/lib/voice-entry";

/** Wert in ein (unkontrolliertes) Formularfeld schreiben */
function setField(id: string, value: string) {
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
  if (el) el.value = value;
}

type Option = { id: string; label: string };
type Product = { id: string; name: string; unit_label: string; requires_external_ref: boolean };

export function PerformanceEntryForm({
  employees,
  products,
  defaultUserId,
  today,
  canApproveOthers,
  clearance,
}: {
  employees: Option[] | null; // null = nur für sich selbst
  products: Product[];
  defaultUserId: string;
  today: string;
  canApproveOthers: boolean;
  clearance: Record<string, string[]>; // freigeschaltete Produkte je Mitarbeiter
}) {
  const [userId, setUserId] = useState(defaultUserId);
  const allowed = products.filter((p) => clearance[userId]?.includes(p.id));
  const [chosen, setChosen] = useState("");
  const productId = allowed.some((p) => p.id === chosen) ? chosen : (allowed[0]?.id ?? "");
  const [key, setKey] = useState(0);
  const product = allowed.find((p) => p.id === productId);
  const forOther = userId !== defaultUserId;

  const fillFrom = (p: ParsedEntry) => {
    if (p.productId) {
      if (allowed.some((a) => a.id === p.productId)) setChosen(p.productId);
      else toast.error("Dieses Produkt ist für die Person nicht freigeschaltet.");
    }
    if (p.quantity) setField("quantity", String(p.quantity));
    if (p.ref) setField("external_ref", p.ref);
    if (p.daysAgo !== undefined) setField("occurred_on", addDays(today, -p.daysAgo));
    if (p.note) setField("note", p.note);
  };

  return (
    <div className="space-y-5">
    {allowed.length ? <QuickEntry products={allowed} onParsed={fillFrom} /> : null}
    <ActionForm key={key} action={createPerformance} onSuccess={() => {
      setKey((k) => k + 1);
      confetti();
    }} className="space-y-5">
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
          {allowed.length === 0 ? (
            <Alert tone="warning" title="Kein Produkt freigeschaltet">
              {forOther ? "Diese Person" : "Du"} {forOther ? "ist" : "bist"} noch für kein Produkt freigeschaltet. Die Freigabe erfolgt durch die Agenturleitung im Mitarbeiterprofil.
            </Alert>
          ) : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Produkt" htmlFor="product_id" error={fieldErrors.product_id}>
              <Select id="product_id" name="product_id" value={productId} onChange={(e) => setChosen(e.target.value)} required>
                {allowed.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                {allowed.length === 0 ? <option value="">Kein Produkt freigeschaltet</option> : null}
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
    </div>
  );
}
