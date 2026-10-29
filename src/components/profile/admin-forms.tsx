"use client";
import { useState } from "react";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  addTrainingNote, anonymizeUser, assignTeam, endMembership, setManager, setRecruiter, setRole, setStatus, setUserPermission, updateEmployee, updateOwnProfile,
} from "@/app/(portal)/mitarbeiter/actions";

type Opt = { id: string; label: string };

export function EditEmployeeDialog({ user }: { user: { id: string; first_name: string; last_name: string; phone: string | null; entry_date: string | null; sales_start_date: string | null; sales_region: string | null; partner_status: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary" size="sm">Stammdaten bearbeiten</Button></DialogTrigger>
      <DialogContent title="Stammdaten bearbeiten">
        <ActionForm action={updateEmployee} onSuccess={() => setOpen(false)} className="space-y-4">
          {({ fieldErrors }) => (
            <>
              <input type="hidden" name="user_id" value={user.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Vorname" htmlFor="e-first" error={fieldErrors.first_name}><Input id="e-first" name="first_name" defaultValue={user.first_name} required /></Field>
                <Field label="Nachname" htmlFor="e-last" error={fieldErrors.last_name}><Input id="e-last" name="last_name" defaultValue={user.last_name} required /></Field>
                <Field label="Telefon" htmlFor="e-phone" error={fieldErrors.phone}><Input id="e-phone" name="phone" type="tel" defaultValue={user.phone ?? ""} /></Field>
                <Field label="Partnerstatus" htmlFor="e-ps">
                  <Select id="e-ps" name="partner_status" defaultValue={user.partner_status}>
                    <option value="in_ausbildung">In Ausbildung</option><option value="aktiv">Aktiv</option><option value="pausiert">Pausiert</option><option value="beendet">Beendet</option>
                  </Select>
                </Field>
                <Field label="Eintrittsdatum" htmlFor="e-entry" error={fieldErrors.entry_date}><Input id="e-entry" name="entry_date" type="date" defaultValue={user.entry_date ?? ""} /></Field>
                <Field label="Start im Vertrieb" htmlFor="e-start" error={fieldErrors.sales_start_date}><Input id="e-start" name="sales_start_date" type="date" defaultValue={user.sales_start_date ?? ""} /></Field>
                <Field label="Vertriebsgebiet" htmlFor="e-region" className="sm:col-span-2" error={fieldErrors.sales_region}><Input id="e-region" name="sales_region" defaultValue={user.sales_region ?? ""} /></Field>
              </div>
              <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Abbrechen</Button><SubmitButton>Speichern</SubmitButton></div>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function OwnProfileForm({ phone }: { phone: string | null }) {
  return (
    <ActionForm action={updateOwnProfile} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      {({ fieldErrors }) => (
        <>
          <Field label="Telefonnummer" htmlFor="own-phone" error={fieldErrors.phone} className="flex-1"><Input id="own-phone" name="phone" type="tel" defaultValue={phone ?? ""} placeholder="z. B. 0170 1234567" /></Field>
          <SubmitButton variant="secondary">Speichern</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function RoleForm({ userId, current, roles }: { userId: string; current: string; roles: { key: string; name: string }[] }) {
  return (
    <ActionForm action={setRole} className="flex items-end gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <Field label="Rolle" htmlFor="role" className="flex-1">
        <Select id="role" name="role" defaultValue={current}>{roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</Select>
      </Field>
      <SubmitButton variant="secondary">Ändern</SubmitButton>
    </ActionForm>
  );
}

export function PermissionForm({ userId, permissions }: { userId: string; permissions: { key: string; description: string }[] }) {
  return (
    <ActionForm action={setUserPermission} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end" resetOnSuccess>
      <input type="hidden" name="user_id" value={userId} />
      <Field label="Einzelberechtigung" htmlFor="perm">
        <Select id="perm" name="permission">{permissions.map((p) => <option key={p.key} value={p.key}>{p.description} ({p.key})</option>)}</Select>
      </Field>
      <Field label="Wirkung" htmlFor="effect">
        <Select id="effect" name="effect"><option value="grant">Zusätzlich erlauben</option><option value="deny">Einschränken</option><option value="remove">Ausnahme entfernen</option></Select>
      </Field>
      <SubmitButton variant="secondary">Übernehmen</SubmitButton>
      <Field label="Begründung (optional)" htmlFor="perm-reason" className="sm:col-span-3"><Input id="perm-reason" name="reason" maxLength={300} /></Field>
    </ActionForm>
  );
}

export function TeamAssignForm({ userId, teams }: { userId: string; teams: Opt[] }) {
  const [role, setRoleState] = useState("mitglied");
  return (
    <ActionForm action={assignTeam} className="space-y-3">
      <input type="hidden" name="user_id" value={userId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Field label="Team" htmlFor="team"><Select id="team" name="team_id">{teams.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></Field>
        <Field label="Funktion" htmlFor="mrole"><Select id="mrole" name="member_role" value={role} onChange={(e) => setRoleState(e.target.value)}><option value="mitglied">Mitglied</option><option value="teamleiter">Teamleitung</option></Select></Field>
        <SubmitButton variant="secondary">Zuordnen</SubmitButton>
      </div>
      {role === "teamleiter" ? <label className="flex items-center gap-2 text-sm"><Checkbox name="includes_subteams" />Unterteams ausdrücklich einschließen</label> : null}
      <p className="text-xs text-muted-foreground">Bei einer neuen Mitgliedschaft wird die bisherige automatisch beendet (Teamwechsel, mit Historie). Zugriffsrechte passen sich sofort an.</p>
    </ActionForm>
  );
}

export function EndMembershipButton({ id, label }: { id: string; label: string }) {
  return <ConfirmAction action={endMembership} hidden={{ id }} title={`Zuordnung „${label}“ beenden?`} confirmLabel="Beenden" tone="danger" reason={{ label: "Grund (optional)" }} trigger={<Button size="sm" variant="ghost">Beenden</Button>} />;
}

export function ManagerForm({ userId, type, current, candidates }: { userId: string; type: "vorgesetzter" | "ausbilder"; current: string | null; candidates: Opt[] }) {
  return (
    <ActionForm action={setManager} className="flex items-end gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="type" value={type} />
      <Field label={type === "ausbilder" ? "Ausbilder" : "Direkter Vorgesetzter"} htmlFor={`m-${type}`} className="flex-1">
        <Select id={`m-${type}`} name="manager_id" defaultValue={current ?? ""}>
          <option value="">– keine Zuordnung –</option>
          {candidates.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>
      </Field>
      <SubmitButton variant="secondary">Speichern</SubmitButton>
    </ActionForm>
  );
}

export function StatusButtons({ userId, status, canAnonymize }: { userId: string; status: string; canAnonymize: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {status === "aktiv" ? (
        <ConfirmAction action={setStatus} hidden={{ user_id: userId, status: "deaktiviert" }} title="Konto deaktivieren?" description="Der Mitarbeiter kann sich nicht mehr anmelden und verliert sofort alle Zugriffe. Daten bleiben erhalten." confirmLabel="Deaktivieren" tone="danger" trigger={<Button variant="danger" size="sm">Konto deaktivieren</Button>} />
      ) : (
        <ConfirmAction action={setStatus} hidden={{ user_id: userId, status: "aktiv" }} title="Konto reaktivieren?" confirmLabel="Reaktivieren" tone="success" trigger={<Button variant="success" size="sm">Konto reaktivieren</Button>} />
      )}
      {canAnonymize && status === "deaktiviert" ? (
        <ConfirmAction action={anonymizeUser} hidden={{ user_id: userId }} title="Personenbezogene Daten löschen?" description="Name, E-Mail, Telefon und Profilbild werden unwiderruflich entfernt. Leistungsdaten bleiben anonymisiert für Auswertungen erhalten. Dieser Schritt kann nicht rückgängig gemacht werden." confirmLabel="Endgültig anonymisieren" tone="danger" trigger={<Button variant="ghost" size="sm" className="text-danger">Daten löschen (DSGVO)</Button>} />
      ) : null}
    </div>
  );
}

export function TrainingNoteForm({ userId }: { userId: string }) {
  return (
    <ActionForm action={addTrainingNote} className="space-y-3" resetOnSuccess>
      {({ fieldErrors }) => (
        <>
          <input type="hidden" name="user_id" value={userId} />
          <Field label="Neue Notiz / Feedback" htmlFor="note-body" error={fieldErrors.body}><Textarea id="note-body" name="body" rows={3} maxLength={5000} /></Field>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm"><Checkbox name="shared" />Für den Mitarbeiter sichtbar (Feedback)</label>
            <SubmitButton variant="secondary" size="sm">Notiz speichern</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function RecruiterForm({ userId, current, candidates }: { userId: string; current: string | null; candidates: Opt[] }) {
  return (
    <ActionForm action={setRecruiter} className="flex items-end gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <Field label="Geworben von" htmlFor="m-werber" className="flex-1" hint="Erhält die Vermittlungsprovision für jede bestätigte Einheit dieser Person">
        <Select id="m-werber" name="recruiter_id" defaultValue={current ?? ""}>
          <option value="">– niemand –</option>
          {candidates.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>
      </Field>
      <SubmitButton variant="secondary">Speichern</SubmitButton>
    </ActionForm>
  );
}
