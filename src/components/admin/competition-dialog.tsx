"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { saveCompetition } from "@/app/(portal)/admin/actions";

type C = { id: string; title: string; description: string | null; product_id: string | null; team_id: string | null; starts_on: string; ends_on: string; is_active: boolean };
type Opt = { id: string; label: string };

export function CompetitionDialog({ c, products, teams, trigger, today }: { c?: C; products: Opt[]; teams: Opt[]; trigger: React.ReactNode; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={c ? "Wettbewerb bearbeiten" : "Neuer Wettbewerb"} description="Zeitlich begrenzte Bestenliste auf Basis bestätigter Leistungen.">
        <ActionForm action={saveCompetition} onSuccess={() => setOpen(false)} className="space-y-4">
          {({ fieldErrors }) => (
            <>
              {c ? <input type="hidden" name="id" value={c.id} /> : null}
              <Field label="Titel" htmlFor="c-title" error={fieldErrors.title}><Input id="c-title" name="title" defaultValue={c?.title} required /></Field>
              <Field label="Beschreibung" htmlFor="c-desc"><Textarea id="c-desc" name="description" defaultValue={c?.description ?? ""} rows={2} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Produkt" htmlFor="c-prod"><Select id="c-prod" name="product_id" defaultValue={c?.product_id ?? ""}><option value="">Alle Produkte</option>{products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select></Field>
                <Field label="Teilnehmer" htmlFor="c-team"><Select id="c-team" name="team_id" defaultValue={c?.team_id ?? ""}><option value="">Gesamte Agentur</option>{teams.map((t) => <option key={t.id} value={t.id}>Team {t.label}</option>)}</Select></Field>
                <Field label="Beginn" htmlFor="c-start" error={fieldErrors.starts_on}><Input id="c-start" name="starts_on" type="date" defaultValue={c?.starts_on ?? today} required /></Field>
                <Field label="Ende" htmlFor="c-end" error={fieldErrors.ends_on}><Input id="c-end" name="ends_on" type="date" defaultValue={c?.ends_on} required /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm"><Checkbox name="is_active" defaultChecked={c?.is_active ?? true} />Aktiv</label>
              <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Abbrechen</Button><SubmitButton>Speichern</SubmitButton></div>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
