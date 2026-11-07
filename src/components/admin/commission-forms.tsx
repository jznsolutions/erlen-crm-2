"use client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui/input";
import { saveOverheadMode, saveRateRow } from "@/app/(portal)/admin/provisionen/actions";
import { LEVELS } from "@/lib/commission";


const euro = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/** Zeile der Provisionstabelle: Produkt bzw. Provisionsstufe × Ränge */
export function RateMatrixRow({ productId, variantId, label, sub, cents }: { productId: string; variantId: string | null; label: string; sub: string; cents: Record<string, number | undefined> }) {
  return (
    <ActionForm action={saveRateRow} className="grid gap-2 px-4 py-3 sm:grid-cols-[1.3fr_repeat(4,1fr)_auto] sm:items-center">
      <input type="hidden" name="product_id" value={productId} />
      <input type="hidden" name="variant_id" value={variantId ?? ""} />
      <div><p className="font-medium">{label}</p><p className="text-xs text-muted-foreground">{sub}</p></div>
      {LEVELS.map((l) => (
        <label key={l.key} className="flex items-center gap-2 sm:block">
          <span className="w-28 shrink-0 text-xs text-muted-foreground sm:hidden">{l.label}</span>
          <span className="relative block w-full">
            <Input name={l.key} aria-label={`Provision ${label} ${l.label}`} defaultValue={cents[l.key] !== undefined ? euro(cents[l.key]!) : ""} placeholder="–" inputMode="decimal" className="h-9 pr-7 text-right tabular" />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
          </span>
        </label>
      ))}
      <SubmitButton size="sm" variant="secondary" pendingText="…">Speichern</SubmitButton>
    </ActionForm>
  );
}

export function OverheadModeForm({ mode, fixed }: { mode: string; fixed: { werbung: number; ausbilder: number; teamleiter: number } }) {
  return (
    <ActionForm action={saveOverheadMode} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Vermittlungsprovision (Werber)" htmlFor="o-w" hint="für jede Einheit eines selbst geworbenen Mitarbeiters"><Input id="o-w" name="werbung" defaultValue={euro(fixed.werbung)} inputMode="decimal" className="text-right tabular" /></Field>
        <Field label="Overhead Ausbilder" htmlFor="o-a" hint="für jede Einheit der eigenen Azubis"><Input id="o-a" name="ausbilder" defaultValue={euro(fixed.ausbilder)} inputMode="decimal" className="text-right tabular" /></Field>
        <Field label="Overhead Teamleiter" htmlFor="o-t" hint="für jede Einheit des eigenen Teams"><Input id="o-t" name="teamleiter" defaultValue={euro(fixed.teamleiter)} inputMode="decimal" className="text-right tabular" /></Field>
      </div>
      <p className="text-xs text-muted-foreground">Beträge in € je bestätigter Einheit, für alle Produkte. Agentur: kein Overhead (Agenturleiter rechnen ihre Mitarbeiter selbst bzw. individuell ab).</p>
      <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
        <input type="radio" name="mode" value="differenz" defaultChecked={mode !== "fest"} className="mt-1 accent-[var(--primary)]" />
        <span><span className="font-medium">Differenz zur Stufe darunter</span><br /><span className="text-muted-foreground">Der Ausbilder erhält seinen Satz minus den Satz des Vertriebspartners, der Teamleiter seinen Satz minus den höchsten Satz darunter. Beispiel Glasfaser: VP 30 €, Ausbilder 40 €, Teamleiter 50 € → VP 30 €, Ausbilder 10 €, Teamleiter 10 € Overhead.</span></span>
      </label>
      <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
        <input type="radio" name="mode" value="fest" defaultChecked={mode === "fest"} className="mt-1 accent-[var(--primary)]" />
        <span><span className="font-medium">Feste Beträge (eure Einstellung)</span><br /><span className="text-muted-foreground">Ausbilder und Teamleiter erhalten die oben eingetragenen festen Beträge je Einheit ihrer Struktur. Ist der Ausbilder zugleich Teamleiter, erhält er den Teamleiter-Betrag.</span></span>
      </label>
      <SubmitButton variant="secondary">Overhead speichern</SubmitButton>
    </ActionForm>
  );
}
