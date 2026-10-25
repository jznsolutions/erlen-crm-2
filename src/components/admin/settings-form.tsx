"use client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Checkbox, Field, Input } from "@/components/ui/input";
import { saveSettings } from "@/app/(portal)/admin/actions";

const ROLES = [
  ["vertriebspartner", "Vertriebspartner"], ["ausbilder", "Ausbilder"], ["teamleiter", "Teamleiter"], ["agenturleiter", "Agenturleiter"], ["admin", "Administrator"],
] as const;

export function SettingsForm({ agencyName, requireApproval, rankings }: { agencyName: string; requireApproval: boolean; rankings: { enabled: boolean; agency_roles: string[]; team_roles: string[] } }) {
  return (
    <ActionForm action={saveSettings} className="space-y-8">
      {({ fieldErrors }) => (
        <>
          <section className="space-y-3">
            <h2 className="font-semibold">Allgemein</h2>
            <Field label="Name der Agentur" htmlFor="s-name" error={fieldErrors.agency_name}><Input id="s-name" name="agency_name" defaultValue={agencyName} className="max-w-md" /></Field>
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">Leistungsfreigabe</h2>
            <label className="flex items-start gap-2 text-sm"><Checkbox name="require_approval" defaultChecked={requireApproval} className="mt-0.5" /><span>Eingereichte Leistungen müssen bestätigt werden (empfohlen). Ohne Freigabe zählen Einreichungen sofort.</span></label>
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">Rankings</h2>
            <label className="flex items-center gap-2 text-sm"><Checkbox name="rankings_enabled" defaultChecked={rankings.enabled} />Bestenlisten aktiviert</label>
            <div className="grid gap-6 sm:grid-cols-2">
              <fieldset className="space-y-2"><legend className="text-sm font-medium">Agenturranking sichtbar für</legend>
                {ROLES.map(([k, n]) => <label key={k} className="flex items-center gap-2 text-sm"><Checkbox name="agency_roles" value={k} defaultChecked={rankings.agency_roles.includes(k)} />{n}</label>)}
              </fieldset>
              <fieldset className="space-y-2"><legend className="text-sm font-medium">Teamranking sichtbar für</legend>
                {ROLES.map(([k, n]) => <label key={k} className="flex items-center gap-2 text-sm"><Checkbox name="team_roles" value={k} defaultChecked={rankings.team_roles.includes(k)} />{n}</label>)}
              </fieldset>
            </div>
            <p className="text-xs text-muted-foreground">Bestenlisten zeigen Vorname und abgekürzten Nachnamen sowie ausschließlich bestätigte Leistungen.</p>
          </section>
          <SubmitButton>Einstellungen speichern</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
