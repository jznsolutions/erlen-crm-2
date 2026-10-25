"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input } from "@/components/ui/input";
import { saveProduct } from "@/app/(portal)/admin/actions";

type P = { id: string; name: string; description: string | null; unit_label: string; requires_external_ref: boolean; is_active: boolean; sort_order: number };

export function ProductDialog({ product, trigger }: { product?: P; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={product ? "Produkt bearbeiten" : "Neues Produkt"} description="Produkte bzw. Leistungsarten, z. B. Glasfaser, PV-Leads, Strom oder Gas.">
        <ActionForm action={saveProduct} onSuccess={() => setOpen(false)} className="space-y-4">
          {({ fieldErrors }) => (
            <>
              {product ? <input type="hidden" name="id" value={product.id} /> : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" htmlFor="p-name" error={fieldErrors.name}><Input id="p-name" name="name" defaultValue={product?.name} required /></Field>
                <Field label="Einheit" htmlFor="p-unit" hint="z. B. Verträge, Leads" error={fieldErrors.unit_label}><Input id="p-unit" name="unit_label" defaultValue={product?.unit_label ?? "Verträge"} required /></Field>
                <Field label="Beschreibung" htmlFor="p-desc" className="sm:col-span-2"><Input id="p-desc" name="description" defaultValue={product?.description ?? ""} /></Field>
                <Field label="Sortierung" htmlFor="p-sort" hint="Bestimmt Reihenfolge und Diagrammfarbe"><Input id="p-sort" name="sort_order" type="number" min={0} defaultValue={product?.sort_order ?? 0} /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm"><Checkbox name="requires_external_ref" defaultChecked={product?.requires_external_ref} />Vorgangs-ID ist Pflicht (verhindert Doppelerfassungen)</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox name="is_active" defaultChecked={product?.is_active ?? true} />Aktiv (kann erfasst werden)</label>
              <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Abbrechen</Button><SubmitButton>Speichern</SubmitButton></div>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
