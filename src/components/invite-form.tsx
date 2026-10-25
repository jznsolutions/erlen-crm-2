"use client";
import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { createInvitation } from "@/app/(portal)/admin/benutzer/actions";

type Opt = { id: string; label: string };

export function InviteForm({ roles, teams, people, canAssignRoles, prefill }: { roles: { key: string; name: string }[]; teams: Opt[]; people: Opt[]; canAssignRoles: boolean; prefill?: { first_name: string; last_name: string; email: string; applicant_id: string } }) {
  const [link, setLink] = useState<{ link: string; sent: boolean } | null>(null);
  return (
    <div className="space-y-4">
      <ActionForm action={createInvitation} resetOnSuccess onSuccess={(r) => r.ok && setLink(r.data as { link: string; sent: boolean })} className="space-y-4">
        {({ fieldErrors }) => (
          <>
            {prefill ? <input type="hidden" name="applicant_id" value={prefill.applicant_id} /> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Vorname" htmlFor="i-first" error={fieldErrors.first_name}><Input id="i-first" name="first_name" defaultValue={prefill?.first_name} required /></Field>
              <Field label="Nachname" htmlFor="i-last" error={fieldErrors.last_name}><Input id="i-last" name="last_name" defaultValue={prefill?.last_name} required /></Field>
              <Field label="Geschäftliche E-Mail" htmlFor="i-email" error={fieldErrors.email} className="sm:col-span-2"><Input id="i-email" name="email" type="email" defaultValue={prefill?.email} required /></Field>
              <Field label="Rolle" htmlFor="i-role" hint={canAssignRoles ? undefined : "Höhere Rollen kann nur ein Administrator vergeben."}>
                <Select id="i-role" name="role" defaultValue="vertriebspartner">
                  {roles.filter((r) => canAssignRoles || r.key === "vertriebspartner").map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                </Select>
              </Field>
              <Field label="Team" htmlFor="i-team"><Select id="i-team" name="team_id"><option value="">– später zuordnen –</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></Field>
              <Field label="Direkter Vorgesetzter" htmlFor="i-sup"><Select id="i-sup" name="supervisor_id"><option value="">–</option>{people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select></Field>
              <Field label="Ausbilder" htmlFor="i-tr"><Select id="i-tr" name="trainer_id"><option value="">–</option>{people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select></Field>
              <Field label="Gültigkeit" htmlFor="i-valid">
                <Select id="i-valid" name="valid_hours" defaultValue="72"><option value="24">24 Stunden</option><option value="72">3 Tage</option><option value="168">7 Tage</option><option value="336">14 Tage</option></Select>
              </Field>
            </div>
            <div className="flex justify-end"><SubmitButton>Einladung erstellen</SubmitButton></div>
          </>
        )}
      </ActionForm>
      {link ? (
        <Alert tone={link.sent ? "success" : "info"} title={link.sent ? "E-Mail versendet" : "Einladungslink (wird nur jetzt angezeigt)"}>
          <p className="mb-2">Der Link ist einmalig verwendbar. Übermittle ihn nur direkt an die eingeladene Person.</p>
          <div className="flex gap-2">
            <Input readOnly value={link.link} className="h-9 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button size="sm" variant="secondary" className="h-9" onClick={() => navigator.clipboard.writeText(link.link).then(() => toast.success("Link kopiert"))}><Copy />Kopieren</Button>
          </div>
        </Alert>
      ) : null}
    </div>
  );
}
