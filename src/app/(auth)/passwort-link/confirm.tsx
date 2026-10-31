"use client";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { confirmPasswordLink } from "@/lib/auth-actions";

export function ConfirmPasswordLink({ tokenHash }: { tokenHash: string }) {
  return (
    <ActionForm action={confirmPasswordLink} className="space-y-4">
      {({ result }) => (
        <>
          <input type="hidden" name="token_hash" value={tokenHash} />
          <SubmitButton className="w-full" size="lg" pendingText="Einen Moment …">Weiter zum neuen Passwort</SubmitButton>
          {result && !result.ok ? <p className="text-center text-sm"><Link href="/passwort-vergessen" className="underline">Neuen Link anfordern</Link></p> : null}
        </>
      )}
    </ActionForm>
  );
}
