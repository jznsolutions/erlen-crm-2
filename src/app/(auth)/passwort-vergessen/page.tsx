"use client";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/lib/auth-actions";

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Passwort zurücksetzen</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">Wir senden dir einen Link zum Festlegen eines neuen Passworts.</p>
      <ActionForm action={requestPasswordReset} className="space-y-4" resetOnSuccess>
        {({ fieldErrors }) => (
          <>
            <Field label="E-Mail-Adresse" htmlFor="email" error={fieldErrors.email}>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
            <SubmitButton className="w-full" size="lg">Link anfordern</SubmitButton>
            <div className="text-center">
              <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">Zurück zur Anmeldung</Link>
            </div>
          </>
        )}
      </ActionForm>
    </div>
  );
}
