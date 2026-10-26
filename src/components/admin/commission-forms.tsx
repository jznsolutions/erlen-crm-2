"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input } from "@/components/ui/input";
import { saveCommissionLevel, saveCommissionRates } from "@/app/(portal)/admin/provisionen/actions";

type Level = { id: string; name: string; description: string | null; sort_order: number; is_active: boolean };

export function LevelDialog({ level, trigger }: { level?: Level; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={level ? "Stufe bearbeiten" : "Neue Provisionsstufe"} description="z. B. Starter, Junior, Senior, Teamleitung">
        <ActionForm action={saveCommissionLevel} onSuccess={() => setOpen(false)} className="space-y-4">
          {({ fieldErrors }) => (
            <>
              {level ? <input type="hidden" name="id" value={level.id} /> : null}
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Name" htmlFor="l-name" className="sm:col-span-2" error={fieldErrors.name}><Input id="l-name" name="name" defaultValue={level?.name} required /></Field>
                <Field label="Reihenfolge" htmlFor="l-sort" error={fieldErrors.sort_order}><Input id="l-sort" name="sort_order" type="number" min={0} defaultValue={level?.sort_order ?? 0} /></Field>
                <Field label="Beschreibung (optional)" htmlFor="l-desc" className="sm:col-span-3" error={fieldErrors.description}><Input id="l-desc" name="description" defaultValue={level?.description ?? ""} placeholder="z. B. ab 20 Verträgen im Monat" /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm"><Checkbox name="is_active" defaultChecked={level?.is_active ?? true} />Aktiv (kann zugewiesen werden)</label>
              <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Abbrechen</Button><SubmitButton>Speichern</SubmitButton></div>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

const euro = (cents: number | undefined) => (cents === undefined ? "" : (cents / 100).toFixed(2).replace(".", ","));

export function RateMatrix({
  levels,
  products,
  rates,
}: {
  levels: { id: string; name: string }[];
  products: { id: string; name: string; unit_label: string }[];
  rates: Record<string, number>; // "<stufe>:<produkt>" -> Cent
}) {
  return (
    <ActionForm action={saveCommissionRates} className="space-y-4">
      {({ fieldErrors }) => (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Produkt</th>
                  {levels.map((l) => <th key={l.id} className="px-3 py-2 font-medium">{l.name}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {products.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2"><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">€ je Einheit ({p.unit_label})</p></td>
                    {levels.map((l) => {
                      const key = `rate:${l.id}:${p.id}`;
                      return (
                        <td key={l.id} className="px-3 py-2">
                          <div className="relative">
                            <Input
                              name={key}
                              aria-label={`${p.name} – ${l.name}`}
                              defaultValue={euro(rates[`${l.id}:${p.id}`])}
                              inputMode="decimal"
                              placeholder="–"
                              className="h-9 pr-7 text-right tabular"
                              aria-invalid={!!fieldErrors[key]}
                            />
                            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Leeres Feld = keine Provision für diese Kombination.</p>
            <SubmitButton>Provisionssätze speichern</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
