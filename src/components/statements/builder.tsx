"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { formatCents, parseEuroToCents } from "@/lib/format";
import { createStatement } from "@/app/(portal)/abrechnungen/actions";

export type BuilderItem = { description: string; product_id: string | null; quantity: number; unit: string };

const blank = (): BuilderItem => ({ description: "", product_id: null, quantity: 1, unit: "" });

export function StatementBuilder({
  kind,
  userId,
  periodFrom,
  periodTo,
  defaultTitle,
  initialItems,
  vatRate,
}: {
  kind: "abrechnung" | "gutschrift";
  userId: string;
  periodFrom: string | null;
  periodTo: string | null;
  defaultTitle: string;
  initialItems: BuilderItem[];
  vatRate: number;
}) {
  const [items, setItems] = useState<BuilderItem[]>(initialItems.length ? initialItems : [blank()]);
  const update = (i: number, patch: Partial<BuilderItem>) => setItems((xs) => xs.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const net = items.reduce((a, it) => a + Math.round((parseEuroToCents(it.unit) ?? 0) * (Number(it.quantity) || 0)), 0);
  const vat = Math.round((net * vatRate) / 100);

  return (
    <ActionForm action={createStatement} redirectTo="/abrechnungen" className="space-y-5">
      {({ fieldErrors }) => (
        <>
          <input type="hidden" name="user_id" value={userId} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="items" value={JSON.stringify(items.filter((it) => it.description.trim() || it.unit.trim()))} />
          {periodFrom ? <input type="hidden" name="period_from" value={periodFrom} /> : null}
          {periodTo ? <input type="hidden" name="period_to" value={periodTo} /> : null}
          <Field label="Titel" htmlFor="st-title" error={fieldErrors.title}>
            <Input id="st-title" name="title" defaultValue={defaultTitle} required maxLength={200} />
          </Field>

          <div className="space-y-2">
            <div className="hidden grid-cols-[1fr_90px_120px_110px_36px] gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Beschreibung</span><span className="text-right">Menge</span><span className="text-right">Einzelpreis (€)</span><span className="text-right">Gesamt</span><span />
            </div>
            {items.map((it, i) => {
              const total = Math.round((parseEuroToCents(it.unit) ?? 0) * (Number(it.quantity) || 0));
              return (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_90px_120px_110px_36px] sm:items-center sm:border-0 sm:p-0">
                  <Input aria-label={`Position ${i + 1} Beschreibung`} className="col-span-2 sm:col-span-1" value={it.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="z. B. Bonus Oktober" maxLength={300} />
                  <Input aria-label={`Position ${i + 1} Menge`} className="text-right tabular" type="number" step="any" value={it.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} />
                  <Input aria-label={`Position ${i + 1} Einzelpreis`} className="text-right tabular" inputMode="decimal" value={it.unit} onChange={(e) => update(i, { unit: e.target.value })} placeholder="0,00" aria-invalid={it.unit.trim() !== "" && parseEuroToCents(it.unit) === null} />
                  <span className="self-center text-right text-sm font-medium tabular">{formatCents(total)}</span>
                  <Button type="button" size="icon" variant="ghost" aria-label={`Position ${i + 1} entfernen`} onClick={() => setItems((xs) => (xs.length > 1 ? xs.filter((_, k) => k !== i) : [blank()]))}><Trash2 /></Button>
                </div>
              );
            })}
            <Button type="button" variant="secondary" size="sm" onClick={() => setItems((xs) => [...xs, blank()])}><Plus />Position hinzufügen</Button>
            <p className="text-xs text-muted-foreground">Abzüge (z. B. Stornorückbelastung) als negativen Einzelpreis eintragen.</p>
          </div>

          <div className="ml-auto w-full max-w-xs space-y-1 rounded-lg border bg-muted/40 p-4 text-sm">
            <div className="flex justify-between"><span>Summe netto</span><span className="tabular">{formatCents(net)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>{vatRate ? `USt ${vatRate} %` : "USt (§ 19 UStG)"}</span><span className="tabular">{formatCents(vat)}</span></div>
            <div className="flex justify-between border-t pt-1 font-semibold"><span>{kind === "abrechnung" ? "Auszahlungsbetrag" : "Gutschriftsbetrag"}</span><span className="tabular">{formatCents(net + vat)}</span></div>
          </div>

          <Field label="Hinweis auf dem Dokument (optional)" htmlFor="st-note" error={fieldErrors.note}>
            <Textarea id="st-note" name="note" rows={2} maxLength={2000} placeholder="z. B. Vielen Dank für deinen Einsatz!" />
          </Field>

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <SubmitButton name="publish" value="true" pendingText="PDF wird erstellt …">
              {kind === "abrechnung" ? "Abrechnung erstellen & veröffentlichen" : "Gutschrift erstellen & veröffentlichen"}
            </SubmitButton>
            <SubmitButton name="publish" value="false" variant="secondary">Als Entwurf speichern</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
