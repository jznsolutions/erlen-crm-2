"use client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Checkbox, Field, Input } from "@/components/ui/input";
import { acceptInvitation } from "@/lib/auth-actions";

export function AcceptForm({ token, email, name }: { token: string; email: string; name: string }) {
  return (
    <ActionForm action={acceptInvitation} className="space-y-4">
      {({ fieldErrors }) => (
        <>
          <input type="hidden" name="token" value={token} />
          <Field label="Name" htmlFor="name">
            <Input id="name" value={name} readOnly disabled />
          </Field>
          <Field label="E-Mail-Adresse" htmlFor="email">
            <Input id="email" value={email} readOnly disabled autoComplete="username" />
          </Field>
          <Field label="Passwort" htmlFor="password" hint="Mindestens 10 Zeichen mit Buchstaben und Ziffern." error={fieldErrors.password}>
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
          </Field>
          <Field label="Passwort wiederholen" htmlFor="confirm" error={fieldErrors.confirm}>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox name="consent" className="mt-0.5" required />
            <span>
              Ich habe die <a href="/datenschutz" target="_blank" className="underline">Datenschutzhinweise</a> für das Mitarbeiterportal zur Kenntnis genommen.
            </span>
          </label>
          {fieldErrors.consent ? <p className="text-xs text-danger">{fieldErrors.consent}</p> : null}
          <SubmitButton className="w-full" size="lg" pendingText="Konto wird eingerichtet …">Konto einrichten</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
