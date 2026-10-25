"use client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui/input";
import { updatePassword } from "@/lib/auth-actions";

export default function ResetPasswordPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Neues Passwort festlegen</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">Mindestens 10 Zeichen mit Buchstaben und Ziffern.</p>
      <ActionForm action={updatePassword} className="space-y-4">
        {({ fieldErrors }) => (
          <>
            <Field label="Neues Passwort" htmlFor="password" error={fieldErrors.password}>
              <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
            </Field>
            <Field label="Passwort wiederholen" htmlFor="confirm" error={fieldErrors.confirm}>
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
            </Field>
            <SubmitButton className="w-full" size="lg">Passwort speichern</SubmitButton>
          </>
        )}
      </ActionForm>
    </div>
  );
}
