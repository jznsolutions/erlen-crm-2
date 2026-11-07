"use client";
import { Trash2 } from "lucide-react";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Checkbox, Input } from "@/components/ui/input";
import { deleteProduct, deleteVariant, saveVariant } from "@/app/(portal)/admin/actions";

type V = { id: string; name: string; sort_order: number; is_active: boolean };

/** Provisionsstufen eines Produkts: z. B. PV-Lead „bis 14 Module“, „15-39 Module“, „ab 40 Module“. */
export function ProductVariants({ productId, productName, variants }: { productId: string; productName: string; variants: V[] }) {
  return (
    <div className="space-y-2">
      {variants.map((v) => (
        <div key={v.id} className="flex flex-wrap items-center gap-2">
          <ActionForm action={saveVariant} className="flex flex-1 flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={v.id} />
            <input type="hidden" name="product_id" value={productId} />
            <input type="hidden" name="sort_order" value={v.sort_order} />
            <Input name="name" defaultValue={v.name} aria-label={`Provisionsstufe ${v.name}`} className="h-9 min-w-40 flex-1" />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><Checkbox name="is_active" defaultChecked={v.is_active} />aktiv</label>
            <SubmitButton size="sm" variant="secondary" pendingText="…">Speichern</SubmitButton>
          </ActionForm>
          <ConfirmAction
            action={deleteVariant}
            hidden={{ id: v.id }}
            title="Provisionsstufe löschen?"
            description={`${productName} – ${v.name}. Die hinterlegten Provisionen dafür werden mitgelöscht.`}
            confirmLabel="Löschen"
            tone="danger"
            trigger={<Button size="icon-sm" variant="ghost" aria-label={`${v.name} löschen`}><Trash2 /></Button>}
          />
        </div>
      ))}
      <ActionForm action={saveVariant} resetOnSuccess className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="product_id" value={productId} />
        <input type="hidden" name="sort_order" value={variants.length ? Math.max(...variants.map((v) => v.sort_order)) + 1 : 0} />
        <Input name="name" placeholder="z. B. bis 14 Module" aria-label={`Neue Provisionsstufe für ${productName}`} className="h-9 min-w-40 flex-1" />
        <SubmitButton size="sm" variant="secondary">Stufe hinzufügen</SubmitButton>
      </ActionForm>
    </div>
  );
}

export function DeleteProductButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmAction
      action={deleteProduct}
      hidden={{ id }}
      title={`„${name}“ endgültig löschen?`}
      description="Das Produkt, seine Provisionsstufen und Provisionen werden gelöscht. Das geht nur, solange noch keine Leistungen dazu erfasst sind – sonst bitte inaktiv schalten."
      confirmLabel="Endgültig löschen"
      tone="danger"
      trigger={<Button size="sm" variant="ghost" aria-label={`${name} löschen`}><Trash2 /></Button>}
    />
  );
}
