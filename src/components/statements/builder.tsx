"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { formatCents, parseEuroToCents } from "@/lib/format";
import { createStatement } from "@/app/(portal)/abrechnungen/actions";
import { ITEM_CATEGORY_LABELS, statementTotals, type ItemCategory } from "@/lib/commission";

export type BuilderItem = {
  description: string;
  product_id: string | null;
  quantity: number;
  unit: string;
  category?: ItemCategory;
  source_id?: string | null;
};
export type BuilderExtra = { id: string; description: string; amount_cents: number; recurring: boolean };

const blank = (category: ItemCategory = "sonstiges"): BuilderItem => ({ description: "", product_id: null, quantity: 1, unit: "", category });
const euro = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const lineTotal = (it: BuilderItem) => Math.round((parseEuroToCents(it.unit) ?? 0) * (Number(it.quantity) || 0));

function Lines({ items, setItems, offset = 0, placeholder }: { items: BuilderItem[]; setItems: (f: (xs: BuilderItem[]) => BuilderItem[]) => void; offset?: number; placeholder: string }) {
  const update = (i: number, patch: Partial<BuilderItem>) => setItems((xs) => xs.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  return (
    <>
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_90px_120px_110px_36px] sm:items-center sm:border-0 sm:p-0">
          <Input aria-label={`Position ${offset + i + 1} Beschreibung`} className="col-span-2 sm:col-span-1" title={it.category ? ITEM_CATEGORY_LABELS[it.category] : undefined} value={it.description} onChange={(e) => update(i, { description: e.target.value })} placeholder={placeholder} maxLength={300} />
          <Input aria-label={`Position ${offset + i + 1} Menge`} className="text-right tabular" type="number" step="any" value={it.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} />
          <Input aria-label={`Position ${offset + i + 1} Einzelpreis`} className="text-right tabular" inputMode="decimal" value={it.unit} onChange={(e) => update(i, { unit: e.target.value })} placeholder="0,00" aria-invalid={it.unit.trim() !== "" && parseEuroToCents(it.unit) === null} />
          <span className={`money self-center text-right text-sm font-medium tabular ${lineTotal(it) < 0 ? "text-danger" : ""}`}>{formatCents(lineTotal(it))}</span>
          <Button type="button" size="icon" variant="ghost" aria-label={`Position ${offset + i + 1} entfernen`} onClick={() => setItems((xs) => xs.filter((_, k) => k !== i))}><Trash2 /></Button>
        </div>
      ))}
    </>
  );
}

/** Erfassung von Provisionsabrechnung bzw. Gutschrift im Aufbau der Agentur-Vorlagen. */
export function StatementBuilder({
  kind,
  userId,
  periodFrom,
  periodTo,
  defaultTitle,
  initialItems,
  extras = [],
  vatRate,
  retentionRate = 0,
  suggestedNumber,
}: {
  kind: "abrechnung" | "gutschrift";
  userId: string;
  periodFrom: string | null;
  periodTo: string | null;
  defaultTitle: string;
  initialItems: BuilderItem[];
  extras?: BuilderExtra[];
  vatRate: number;
  retentionRate?: number;
  suggestedNumber?: string;
}) {
  const gs = kind === "gutschrift";
  const [items, setItems] = useState<BuilderItem[]>(initialItems.length ? initialItems : [blank()]);
  const [deductions, setDeductions] = useState<BuilderItem[]>([]);
  const [picked, setPicked] = useState<string[]>(extras.filter((e) => e.recurring).map((e) => e.id));
  const [retention, setRetention] = useState(String(retentionRate));
  const extraItems: BuilderItem[] = extras
    .filter((e) => picked.includes(e.id))
    .map((e) => ({ description: e.description, product_id: null, quantity: 1, unit: euro(e.amount_cents), category: e.amount_cents < 0 && gs ? "abzug" : "zusatz" }));
  const filled = (xs: BuilderItem[]) => xs.filter((it) => it.description.trim() || it.unit.trim());
  const manualDeductions = filled(deductions).map((d) => ({ ...d, category: "abzug" as const, unit: "-" + (d.unit || "0").replace(/^-/, "") }));
  const all = [...filled(items), ...extraItems, ...manualDeductions];
  const rate = gs ? Math.min(Math.max(Number(retention.replace(",", ".")) || 0, 0), 100) : 0;
  const t = statementTotals(all.map((it) => ({ total: lineTotal(it), category: it.category ?? "sonstiges" })), rate, gs ? vatRate : 0);

  return (
    <ActionForm action={createStatement} redirectTo="/abrechnungen" className="space-y-5">
      {({ fieldErrors }) => (
        <>
          <input type="hidden" name="user_id" value={userId} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="items" value={JSON.stringify(all)} />
          <input type="hidden" name="retention_rate" value={String(rate)} />
          {periodFrom ? <input type="hidden" name="period_from" value={periodFrom} /> : null}
          {periodTo ? <input type="hidden" name="period_to" value={periodTo} /> : null}
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field label="Titel (nur intern und im Dateinamen)" htmlFor="st-title" error={fieldErrors.title}>
              <Input id="st-title" name="title" defaultValue={defaultTitle} required maxLength={200} />
            </Field>
            <Field label={gs ? "Gutschriftnummer" : "Abrechnungsnummer"} htmlFor="st-number" hint="Fortlaufend vorgeschlagen – bei Bedarf ändern" error={fieldErrors.number}>
              <Input id="st-number" name="number" defaultValue={suggestedNumber ?? ""} placeholder="automatisch" maxLength={40} className="font-mono uppercase" />
            </Field>
          </div>
          <input type="hidden" name="suggested_number" value={suggestedNumber ?? ""} />

          <div className="space-y-2">
            <div className="hidden grid-cols-[1fr_90px_120px_110px_36px] gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Produkt</span><span className="text-right">Anzahl</span><span className="text-right">Netto (€)</span><span className="text-right">Netto</span><span />
            </div>
            <Lines items={items} setItems={setItems} placeholder={gs ? "z. B. Bonus" : "z. B. E.ON Highspeed 1000"} />
            <Button type="button" variant="secondary" size="sm" onClick={() => setItems((xs) => [...xs, blank()])}><Plus />Position hinzufügen</Button>
            <p className="text-xs text-muted-foreground">{gs ? "Positionen vor dem Stornobehalt." : "Stornos mit negativer Anzahl eintragen (z. B. −1)."}</p>
          </div>

          {extras.length ? (
            <fieldset className="rounded-xl border p-4">
              <legend className="px-1 text-sm font-medium">Zusatzpositionen dieses Mitarbeiters</legend>
              <div className="space-y-2">
                {extras.map((e) => (
                  <label key={e.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={picked.includes(e.id)} onChange={(ev) => setPicked((xs) => (ev.target.checked ? [...xs, e.id] : xs.filter((x) => x !== e.id)))} />
                      {e.description}
                    </span>
                    <span className={`money tabular font-medium ${e.amount_cents < 0 ? "text-danger" : "text-success"}`}>{formatCents(e.amount_cents)}</span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{gs ? "Abzüge (z. B. KFZ) werden nach dem Stornobehalt abgezogen. " : ""}Zusatzpositionen pflegst du im Mitarbeiterprofil.</p>
            </fieldset>
          ) : null}

          {gs ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Weitere Abzüge nach Einbehalt</p>
              <Lines items={deductions} setItems={setDeductions} offset={items.length} placeholder="z. B. KFZ" />
              <Button type="button" variant="secondary" size="sm" onClick={() => setDeductions((xs) => [...xs, blank("abzug")])}><Plus />Abzug hinzufügen</Button>
            </div>
          ) : null}

          <div className="money ml-auto w-full max-w-sm space-y-1 rounded-lg border bg-muted/40 p-4 text-sm">
            <div className="flex justify-between font-semibold"><span>Zwischensumme</span><span className="tabular">{formatCents(t.subtotal)}</span></div>
            {gs ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="st-ret" className="flex items-center gap-1">abzgl. Stornobehalt <Input id="st-ret" value={retention} onChange={(e) => setRetention(e.target.value)} inputMode="decimal" className="h-7 w-14 px-1.5 text-right" /> %</label>
                  <span className="tabular">{formatCents(t.retention)}</span>
                </div>
                <div className="flex justify-between"><span>Netto nach Einbehalt</span><span className="tabular">{formatCents(t.afterRetention)}</span></div>
                {t.deductions ? (
                  <>
                    <div className="flex justify-between text-danger"><span>abzgl. Abzüge</span><span className="tabular">−{formatCents(t.deductions)}</span></div>
                    <div className="flex justify-between"><span>Netto nach Abzügen</span><span className="tabular">{formatCents(t.net)}</span></div>
                  </>
                ) : null}
                <div className="flex justify-between text-muted-foreground"><span>{vatRate ? `zzgl. USt. ${vatRate} %` : "USt. (§ 19 UStG)"}</span><span className="tabular">{formatCents(t.vat)}</span></div>
                <div className="flex justify-between border-t pt-1 font-semibold"><span>GESAMTSUMME</span><span className="tabular">{formatCents(t.gross)}</span></div>
              </>
            ) : null}
          </div>

          <Field label="Hinweis auf dem Dokument (optional)" htmlFor="st-note" error={fieldErrors.note}>
            <Textarea id="st-note" name="note" rows={2} maxLength={2000} />
          </Field>

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <SubmitButton name="publish" value="true" pendingText="PDF wird erstellt …">
              {gs ? "Gutschrift erstellen & veröffentlichen" : "Abrechnung erstellen & veröffentlichen"}
            </SubmitButton>
            <SubmitButton name="publish" value="false" variant="secondary">Als Entwurf speichern</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
