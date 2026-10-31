"use client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Checkbox, Input } from "@/components/ui/input";
import { ROLE_LABELS, type RoleKey } from "@/lib/permissions";
import { saveCareerSettings } from "@/app/(portal)/admin/einstellungen/actions";

type Step = { from: string; to: string; sales: number; recruits: number; months: number };

export function CareerSettingsForm({ enabled, steps }: { enabled: boolean; steps: Step[] }) {
  return (
    <ActionForm action={saveCareerSettings} className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="enabled" defaultChecked={enabled} />
        Karriereleiter für alle sichtbar schalten
      </label>
      <div className="space-y-3">
        {steps.map((s, i) => (
          <fieldset key={i} className="rounded-xl border border-white/10 p-3">
            <legend className="px-1 text-sm font-medium">{ROLE_LABELS[s.from as RoleKey] ?? s.from} → {ROLE_LABELS[s.to as RoleKey] ?? s.to}</legend>
            <input type="hidden" name={`from_${i}`} value={s.from} />
            <input type="hidden" name={`to_${i}`} value={s.to} />
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs text-muted-foreground">Verträge gesamt<Input name={`sales_${i}`} type="number" min={0} defaultValue={s.sales} className="mt-1" /></label>
              <label className="text-xs text-muted-foreground">Geworbene Partner<Input name={`recruits_${i}`} type="number" min={0} defaultValue={s.recruits} className="mt-1" /></label>
              <label className="text-xs text-muted-foreground">Monate dabei<Input name={`months_${i}`} type="number" min={0} defaultValue={s.months} className="mt-1" /></label>
            </div>
          </fieldset>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Die Werte sind Vorschläge – bitte an eure Praxis anpassen. Erfüllt jemand alle Kriterien, bekommen die Person und die Administration eine Benachrichtigung. Die Rolle ändert ihr danach bewusst im Mitarbeiterprofil.</p>
      <SubmitButton variant="secondary">Speichern</SubmitButton>
    </ActionForm>
  );
}
