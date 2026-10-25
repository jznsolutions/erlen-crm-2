"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { saveTarget } from "@/app/(portal)/ziele/actions";
import { endOfMonth, startOfMonth } from "@/lib/dates";

type Opt = { id: string; label: string };

export function TargetDialog({ employees, teams, products, allowAgency, today }: { employees: Opt[]; teams: Opt[]; products: Opt[]; allowAgency: boolean; today: string }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"mitarbeiter" | "team" | "agentur">(employees.length ? "mitarbeiter" : "team");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus />Ziel anlegen</Button></DialogTrigger>
      <DialogContent title="Neues Ziel" description="Fortschritte werden ausschließlich aus bestätigten Leistungen berechnet.">
        <ActionForm action={saveTarget} onSuccess={() => setOpen(false)} className="space-y-4">
          {({ fieldErrors }) => (
            <>
              <Field label="Bezeichnung" htmlFor="t-title" error={fieldErrors.title}>
                <Input id="t-title" name="title" required maxLength={120} placeholder="z. B. Monatsziel Glasfaser" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Gilt für" htmlFor="t-scope">
                  <Select id="t-scope" name="scope" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
                    {employees.length ? <option value="mitarbeiter">Mitarbeiter</option> : null}
                    {teams.length ? <option value="team">Team</option> : null}
                    {allowAgency ? <option value="agentur">Gesamte Agentur</option> : null}
                  </Select>
                </Field>
                {scope === "mitarbeiter" ? (
                  <Field label="Mitarbeiter" htmlFor="t-user" error={fieldErrors.user_id}>
                    <Select id="t-user" name="user_id">{employees.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</Select>
                  </Field>
                ) : scope === "team" ? (
                  <Field label="Team" htmlFor="t-team" error={fieldErrors.team_id}>
                    <Select id="t-team" name="team_id">{teams.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</Select>
                  </Field>
                ) : <div />}
                <Field label="Produkt" htmlFor="t-product">
                  <Select id="t-product" name="product_id"><option value="">Alle Produkte</option>{products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select>
                </Field>
                <Field label="Periode" htmlFor="t-period" hint="Bei Tag/Woche/Monat gilt der Zielwert je Periode.">
                  <Select id="t-period" name="period" defaultValue="monat">
                    <option value="tag">Täglich</option>
                    <option value="woche">Wöchentlich</option>
                    <option value="monat">Monatlich</option>
                    <option value="zeitraum">Gesamter Zeitraum</option>
                  </Select>
                </Field>
                <Field label="Gültig ab" htmlFor="t-start" error={fieldErrors.starts_on}>
                  <Input id="t-start" name="starts_on" type="date" defaultValue={startOfMonth(today)} required />
                </Field>
                <Field label="Gültig bis" htmlFor="t-end" error={fieldErrors.ends_on}>
                  <Input id="t-end" name="ends_on" type="date" defaultValue={endOfMonth(today)} required />
                </Field>
                <Field label="Zielwert" htmlFor="t-value" error={fieldErrors.target_value}>
                  <Input id="t-value" name="target_value" type="number" min={1} required defaultValue={20} />
                </Field>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Abbrechen</Button>
                <SubmitButton>Ziel speichern</SubmitButton>
              </div>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
