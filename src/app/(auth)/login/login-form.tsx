"use client";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth-actions";

export function LoginForm({ next }: { next?: string }) {
  return (
    <ActionForm action={signIn} className="space-y-4">
      {({ fieldErrors }) => (
        <>
          {next ? <input type="hidden" name="weiter" value={next} /> : null}
          <Field label="E-Mail-Adresse" htmlFor="email" error={fieldErrors.email}>
            <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          </Field>
          <Field label="Passwort" htmlFor="password" error={fieldErrors.password}>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <SubmitButton className="w-full" size="lg" pendingText="Anmeldung läuft …">Anmelden</SubmitButton>
          <div className="text-center">
            <Link href="/passwort-vergessen" className="text-sm text-muted-foreground hover:text-foreground">
              Passwort vergessen?
            </Link>
          </div>
        </>
      )}
    </ActionForm>
  );
}
