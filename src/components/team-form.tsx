"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { saveTeam } from "@/app/(portal)/teams/actions";

type Team = { id: string; name: string; description: string | null; parent_team_id: string | null; is_active: boolean };

export function TeamDialog({ team, teams, trigger }: { team?: Team; teams: { id: string; name: string }[]; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={team ? "Team bearbeiten" : "Neues Team"}>
        <ActionForm action={saveTeam} onSuccess={() => setOpen(false)} className="space-y-4">
          {({ fieldErrors }) => (
            <>
              {team ? <input type="hidden" name="id" value={team.id} /> : null}
              <Field label="Name" htmlFor="tm-name" error={fieldErrors.name}><Input id="tm-name" name="name" defaultValue={team?.name} required /></Field>
              <Field label="Beschreibung" htmlFor="tm-desc"><Textarea id="tm-desc" name="description" defaultValue={team?.description ?? ""} rows={2} /></Field>
              <Field label="Übergeordnetes Team" htmlFor="tm-parent" hint="Für Unterteams. Teamleiter sehen Unterteams nur bei ausdrücklicher Freigabe." error={fieldErrors.parent_team_id}>
                <Select id="tm-parent" name="parent_team_id" defaultValue={team?.parent_team_id ?? ""}>
                  <option value="">– keines –</option>
                  {teams.filter((t) => t.id !== team?.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
              {team ? <label className="flex items-center gap-2 text-sm"><Checkbox name="is_active" defaultChecked={team.is_active} />Team ist aktiv</label> : null}
              <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Abbrechen</Button><SubmitButton>Speichern</SubmitButton></div>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
