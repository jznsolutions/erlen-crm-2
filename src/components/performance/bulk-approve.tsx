"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Checkbox } from "@/components/ui/input";
import { approveMany } from "@/app/(portal)/leistungen/actions";

/** Auswahlkästchen + Sammelbestätigung. Die Zeilen werden als children gerendert. */
export function BulkApprove({ ids, children }: { ids: string[]; children: (ctx: { selected: Set<string>; toggle: (id: string) => void }) => React.ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <div>
      <ActionForm action={approveMany} onSuccess={() => setSelected(new Set())} className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
        {[...selected].map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={selected.size === ids.length && ids.length > 0}
            onChange={(e) => setSelected(e.target.checked ? new Set(ids) : new Set())}
            aria-label="Alle auswählen"
          />
          Alle auswählen
        </label>
        <SubmitButton size="sm" variant="success" disabled={selected.size === 0} pendingText="Wird bestätigt …">
          {selected.size > 0 ? `${selected.size} bestätigen` : "Auswahl bestätigen"}
        </SubmitButton>
      </ActionForm>
      {children({ selected, toggle })}
    </div>
  );
}

export function RowCheckbox({ id, selected, toggle }: { id: string; selected: Set<string>; toggle: (id: string) => void }) {
  return <Checkbox checked={selected.has(id)} onChange={() => toggle(id)} aria-label="Auswählen" />;
}
