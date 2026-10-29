"use client";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { deleteRate, saveOverheadMode, saveRate } from "@/app/(portal)/admin/provisionen/actions";
import { Trash2 } from "lucide-react";
import { LEVELS } from "@/lib/commission";


const euro = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/** Neue Zeile: Produkt | Stufe | Provision */
export function AddRateForm({ products }: { products: { id: string; name: string }[] }) {
  return (
    <ActionForm action={saveRate} resetOnSuccess className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end">
      {({ fieldErrors }) => (
        <>
          <Field label="Produkt" htmlFor="r-product" error={fieldErrors.product_id}>
            <Select id="r-product" name="product_id" required defaultValue="">
              <option value="" disabled>Produkt wählen …</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Stufe" htmlFor="r-level" error={fieldErrors.level}>
            <Select id="r-level" name="level" required defaultValue="">
              <option value="" disabled>Stufe wählen …</option>
              {LEVELS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
            </Select>
          </Field>
          <Field label="Provision (€ je Einheit)" htmlFor="r-amount" error={fieldErrors.amount}>
            <Input id="r-amount" name="amount" inputMode="decimal" placeholder="z. B. 30,00" required className="text-right tabular" />
          </Field>
          <SubmitButton>Hinzufügen</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

/** Bestehende Zeile mit änderbarem Betrag. */
export function RateRow({ productId, productName, unit, level, cents }: { productId: string; productName: string; unit: string; level: string; cents: number }) {
  const label = LEVELS.find((l) => l.key === level)?.label ?? level;
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
      <div><p className="font-medium">{productName}</p><p className="text-xs text-muted-foreground">je Einheit ({unit})</p></div>
      <p className="text-sm sm:order-none">{label}</p>
      <ActionForm action={saveRate} className="flex items-center gap-2">
        <input type="hidden" name="product_id" value={productId} />
        <input type="hidden" name="level" value={level} />
        <div className="relative w-full">
          <Input name="amount" aria-label={`Provision ${productName} ${label}`} defaultValue={euro(cents)} inputMode="decimal" className="h-9 pr-7 text-right tabular" />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
        </div>
        <SubmitButton size="sm" variant="secondary" pendingText="…">Speichern</SubmitButton>
      </ActionForm>
      <ConfirmAction action={deleteRate} hidden={{ product_id: productId, level }} title="Provision entfernen?" description={`${productName} · ${label}`} confirmLabel="Entfernen" tone="danger" trigger={<Button size="icon-sm" variant="ghost" aria-label={`${productName} ${label} entfernen`}><Trash2 /></Button>} />
    </div>
  );
}

export function OverheadModeForm({ mode }: { mode: string }) {
  return (
    <ActionForm action={saveOverheadMode} className="space-y-3">
      <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
        <input type="radio" name="mode" value="differenz" defaultChecked={mode !== "fest"} className="mt-1 accent-[var(--primary)]" />
        <span><span className="font-medium">Differenz (Standard im Strukturvertrieb)</span><br /><span className="text-muted-foreground">Der Ausbilder erhält seinen Satz minus den Satz des Vertriebspartners, der Teamleiter seinen Satz minus den höchsten Satz darunter. Beispiel Glasfaser: VP 30 €, Ausbilder 40 €, Teamleiter 50 € → VP 30 €, Ausbilder 10 €, Teamleiter 10 € Overhead.</span></span>
      </label>
      <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
        <input type="radio" name="mode" value="fest" defaultChecked={mode === "fest"} className="mt-1 accent-[var(--primary)]" />
        <span><span className="font-medium">Fester Overhead-Betrag</span><br /><span className="text-muted-foreground">Der eingetragene Satz der Stufe Ausbilder bzw. Teamleiter wird je Einheit seiner Struktur voll als Overhead gezahlt.</span></span>
      </label>
      <SubmitButton variant="secondary">Berechnungsart speichern</SubmitButton>
    </ActionForm>
  );
}
