"use client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui/input";
import { verifyMfaCode } from "@/lib/mfa-actions";

export function MfaCodeForm({ weiter }: { weiter: string }) {
  return (
    <ActionForm action={verifyMfaCode} className="space-y-4">
      {({ fieldErrors }) => (
        <>
          <input type="hidden" name="weiter" value={weiter} />
          <Field label="Code" htmlFor="code" error={fieldErrors.code}>
            <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} autoFocus required className="text-center text-lg tracking-[0.4em]" placeholder="123456" />
          </Field>
          <SubmitButton className="w-full" size="lg" pendingText="Wird geprüft …">Bestätigen</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
