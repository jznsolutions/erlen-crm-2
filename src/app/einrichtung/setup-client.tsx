"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { createFirstAdmin, initializeDatabase } from "./actions";

export function InitButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="space-y-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await initializeDatabase();
            if (!r.ok) setError(r.error);
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : null}
        {pending ? "Wird eingerichtet … (bis zu 1 Minute)" : "Datenbank jetzt einrichten"}
      </Button>
    </div>
  );
}

export function AdminForm() {
  return (
    <ActionForm action={createFirstAdmin} className="space-y-4" redirectTo="/login">
      {({ fieldErrors }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vorname" htmlFor="s-first" error={fieldErrors.first_name}><Input id="s-first" name="first_name" required autoComplete="given-name" /></Field>
            <Field label="Nachname" htmlFor="s-last" error={fieldErrors.last_name}><Input id="s-last" name="last_name" required autoComplete="family-name" /></Field>
          </div>
          <Field label="Deine E-Mail-Adresse" htmlFor="s-email" error={fieldErrors.email}><Input id="s-email" name="email" type="email" required autoComplete="email" /></Field>
          <Field label="Passwort" htmlFor="s-pw" hint="Mindestens 10 Zeichen mit Buchstaben und Ziffern. Gut merken!" error={fieldErrors.password}><Input id="s-pw" name="password" type="password" required autoComplete="new-password" /></Field>
          <Field label="Passwort wiederholen" htmlFor="s-pw2" error={fieldErrors.confirm}><Input id="s-pw2" name="confirm" type="password" required autoComplete="new-password" /></Field>
          <SubmitButton className="w-full" size="lg" pendingText="Konto wird angelegt …">Administrator-Konto anlegen</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
