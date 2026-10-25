"use client";
import { useState } from "react";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { correctPerformance, transitionPerformance } from "@/app/(portal)/leistungen/actions";
import type { PerformanceStatus } from "@/lib/metrics";

type Rec = { id: string; status: PerformanceStatus; product_id: string; occurred_on: string; quantity: number };

export function RecordActions({
  rec,
  ownerSide,
  canApprove,
  products,
  today,
}: {
  rec: Rec;
  ownerSide: boolean;
  canApprove: boolean;
  products: { id: string; name: string }[];
  today: string;
}) {
  const [correctOpen, setCorrectOpen] = useState(false);
  const h = (action: string) => ({ id: rec.id, action });
  const btn = (label: string, variant: "secondary" | "ghost" | "success" | "danger" = "secondary") => (
    <Button size="sm" variant={variant}>{label}</Button>
  );

  const primary: React.ReactNode[] = [];
  const more: React.ReactNode[] = [];

  if (canApprove && rec.status === "eingereicht") {
    primary.push(<ConfirmAction key="ok" action={transitionPerformance} hidden={h("bestaetigen")} trigger={btn("Bestätigen", "success")} title="Leistung bestätigen?" description="Die Leistung zählt danach zur offiziellen Leistung, zu Zielen und Rankings." confirmLabel="Bestätigen" tone="success" />);
    primary.push(<ConfirmAction key="no" action={transitionPerformance} hidden={h("ablehnen")} trigger={btn("Ablehnen", "ghost")} title="Leistung ablehnen" confirmLabel="Ablehnen" tone="danger" reason={{ label: "Begründung", required: true, placeholder: "z. B. Vertrag unvollständig" }} />);
  }
  if (ownerSide && (rec.status === "entwurf" || rec.status === "abgelehnt")) {
    primary.push(<ConfirmAction key="sub" action={transitionPerformance} hidden={h("einreichen")} trigger={btn("Einreichen")} title="Leistung einreichen?" description="Nach dem Einreichen wird die Leistung geprüft." confirmLabel="Einreichen" />);
  }
  if (ownerSide && rec.status === "eingereicht" && !canApprove) {
    more.push(<ConfirmAction key="wd" action={transitionPerformance} hidden={h("zurueckziehen")} trigger={btn("Zurückziehen", "ghost")} title="Einreichung zurückziehen?" confirmLabel="Zurückziehen" />);
  }
  if (ownerSide && rec.status === "entwurf") {
    more.push(<ConfirmAction key="del" action={transitionPerformance} hidden={h("loeschen")} trigger={btn("Löschen", "ghost")} title="Entwurf löschen?" description="Nur nie eingereichte Entwürfe können gelöscht werden." confirmLabel="Löschen" tone="danger" />);
  }
  if (canApprove && rec.status === "bestaetigt") {
    more.push(<Button key="cor" size="sm" variant="ghost" onClick={() => setCorrectOpen(true)}>Korrigieren</Button>);
  }
  if (canApprove && (rec.status === "bestaetigt" || rec.status === "eingereicht")) {
    more.push(<ConfirmAction key="sto" action={transitionPerformance} hidden={h("stornieren")} trigger={btn("Stornieren", "ghost")} title="Leistung stornieren" description="Die Leistung wird nicht mehr gezählt. Der Vorgang bleibt im Protokoll erhalten." confirmLabel="Stornieren" tone="danger" reason={{ label: "Begründung", required: true, placeholder: "z. B. Kunde hat widerrufen" }} />);
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {primary}
      {more}
      <Dialog open={correctOpen} onOpenChange={setCorrectOpen}>
        <DialogContent title="Leistung korrigieren" description="Der bestätigte Datensatz wird als „korrigiert“ markiert und durch einen neuen, verknüpften Datensatz ersetzt.">
          <ActionForm action={correctPerformance} onSuccess={() => setCorrectOpen(false)} className="space-y-4">
            {({ fieldErrors }) => (
              <>
                <input type="hidden" name="id" value={rec.id} />
                <Field label="Produkt" htmlFor="c-product" error={fieldErrors.product_id}>
                  <Select id="c-product" name="product_id" defaultValue={rec.product_id}>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Datum" htmlFor="c-date" error={fieldErrors.occurred_on}>
                    <Input id="c-date" name="occurred_on" type="date" defaultValue={rec.occurred_on} max={today} />
                  </Field>
                  <Field label="Menge" htmlFor="c-qty" error={fieldErrors.quantity}>
                    <Input id="c-qty" name="quantity" type="number" min={1} max={1000} defaultValue={rec.quantity} />
                  </Field>
                </div>
                <Field label="Begründung *" htmlFor="c-reason" error={fieldErrors.reason}>
                  <Textarea id="c-reason" name="reason" required maxLength={500} />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setCorrectOpen(false)}>Abbrechen</Button>
                  <SubmitButton>Korrektur speichern</SubmitButton>
                </div>
              </>
            )}
          </ActionForm>
        </DialogContent>
      </Dialog>
    </div>
  );
}
