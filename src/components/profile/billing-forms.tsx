"use client";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";
import { saveBilling, setCommissionLevel, setUserProducts } from "@/app/(portal)/mitarbeiter/actions";
import { deleteExtra, saveExtra } from "@/app/(portal)/abrechnungen/actions";

type Opt = { id: string; label: string };

export function ProductClearanceForm({ userId, products, granted }: { userId: string; products: Opt[]; granted: string[] }) {
  return (
    <ActionForm action={setUserProducts} className="space-y-3">
      <input type="hidden" name="user_id" value={userId} />
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {products.map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-sm">
            <Checkbox name="product_ids" value={p.id} defaultChecked={granted.includes(p.id)} />
            {p.label}
          </label>
        ))}
      </div>
      <SubmitButton variant="secondary" size="sm">Freigaben speichern</SubmitButton>
    </ActionForm>
  );
}

export function CommissionLevelForm({ userId, levels, current, roleLevel }: { userId: string; levels: Opt[]; current: string | null; roleLevel: string | null }) {
  return (
    <ActionForm action={setCommissionLevel} className="flex items-end gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <Field label="Provisionsstufe" htmlFor="c-level" className="flex-1">
        <Select id="c-level" name="level_id" defaultValue={current ?? ""}>
          <option value="">Automatisch nach Rolle{roleLevel ? ` (${roleLevel})` : ""}</option>
          {levels.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </Select>
      </Field>
      <SubmitButton variant="secondary">Speichern</SubmitButton>
    </ActionForm>
  );
}

export type Billing = {
  street: string | null;
  postal_code: string | null;
  city: string | null;
  tax_number: string | null;
  vat_id: string | null;
  vat_liable: boolean;
  iban: string | null;
};

export function BillingForm({ userId, billing }: { userId: string; billing: Billing | null }) {
  return (
    <ActionForm action={saveBilling} className="space-y-4">
      {({ fieldErrors }) => (
        <>
          <input type="hidden" name="user_id" value={userId} />
          <div className="grid gap-4 sm:grid-cols-6">
            <Field label="Straße und Hausnummer" htmlFor="b-street" className="sm:col-span-6" error={fieldErrors.street}><Input id="b-street" name="street" defaultValue={billing?.street ?? ""} autoComplete="street-address" /></Field>
            <Field label="PLZ" htmlFor="b-plz" className="sm:col-span-2" error={fieldErrors.postal_code}><Input id="b-plz" name="postal_code" defaultValue={billing?.postal_code ?? ""} autoComplete="postal-code" /></Field>
            <Field label="Ort" htmlFor="b-city" className="sm:col-span-4" error={fieldErrors.city}><Input id="b-city" name="city" defaultValue={billing?.city ?? ""} autoComplete="address-level2" /></Field>
            <Field label="Steuernummer" htmlFor="b-tax" className="sm:col-span-3" error={fieldErrors.tax_number}><Input id="b-tax" name="tax_number" defaultValue={billing?.tax_number ?? ""} /></Field>
            <Field label="USt-IdNr. (falls vorhanden)" htmlFor="b-vat" className="sm:col-span-3" error={fieldErrors.vat_id}><Input id="b-vat" name="vat_id" defaultValue={billing?.vat_id ?? ""} placeholder="DE123456789" /></Field>
            <Field label="IBAN für Auszahlungen" htmlFor="b-iban" className="sm:col-span-6" error={fieldErrors.iban}><Input id="b-iban" name="iban" defaultValue={billing?.iban ?? ""} autoComplete="off" className="font-mono" /></Field>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox name="vat_liable" defaultChecked={billing?.vat_liable ?? false} className="mt-0.5" />
            <span>Umsatzsteuerpflichtig (Regelbesteuerung). Ohne Haken wird die Kleinunternehmerregelung nach § 19 UStG angenommen – Abrechnungen dann ohne Umsatzsteuer.</span>
          </label>
          <SubmitButton variant="secondary">Abrechnungsdaten speichern</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export type Extra = { id: string; description: string; amount_cents: number; recurring: boolean; is_active: boolean; note: string | null };

/** Zusatzpositionen (z. B. Fahrzeug über die Agentur) – stehen beim Erstellen der Gutschrift zur Auswahl. */
export function ExtrasEditor({ userId, extras }: { userId: string; extras: Extra[] }) {
  return (
    <div className="space-y-4">
      {extras.length ? (
        <ul className="divide-y rounded-xl border text-sm">
          {extras.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span>
                <span className="font-medium">{e.description}</span>
                {e.recurring ? <span className="ml-2 text-xs text-muted-foreground">monatlich vorausgewählt</span> : null}
                {!e.is_active ? <span className="ml-2 text-xs text-muted-foreground">(inaktiv)</span> : null}
              </span>
              <span className="flex items-center gap-2">
                <span className={`money tabular font-medium ${e.amount_cents < 0 ? "text-danger" : "text-success"}`}>{(e.amount_cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
                <ConfirmAction action={deleteExtra} hidden={{ id: e.id }} title="Zusatzposition entfernen?" description={e.description} confirmLabel="Entfernen" tone="danger" trigger={<Button size="sm" variant="ghost">Entfernen</Button>} />
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">Keine Zusatzpositionen.</p>}
      <ActionForm action={saveExtra} resetOnSuccess className="grid gap-3 sm:grid-cols-[1.5fr_0.8fr_0.8fr] sm:items-end">
        {({ fieldErrors }) => (
          <>
            <input type="hidden" name="user_id" value={userId} />
            <Field label="Bezeichnung" htmlFor="x-desc" error={fieldErrors.description}><Input id="x-desc" name="description" placeholder="z. B. Fahrzeugrate VW Golf" required /></Field>
            <Field label="Art" htmlFor="x-kind"><Select id="x-kind" name="kind" defaultValue="abzug"><option value="abzug">Abzug</option><option value="zuschlag">Zuschlag</option></Select></Field>
            <Field label="Betrag (€)" htmlFor="x-amount" error={fieldErrors.amount}><Input id="x-amount" name="amount" inputMode="decimal" placeholder="399,00" required className="text-right" /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox name="recurring" defaultChecked />Bei jeder Gutschrift automatisch vorauswählen (z. B. monatliche Rate)</label>
            <SubmitButton variant="secondary">Hinzufügen</SubmitButton>
          </>
        )}
      </ActionForm>
    </div>
  );
}
