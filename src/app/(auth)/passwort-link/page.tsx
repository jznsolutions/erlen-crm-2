import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmPasswordLink } from "./confirm";

export const metadata: Metadata = { title: "Neues Passwort", robots: { index: false, follow: false } };

export default async function PasswordLinkPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { token_hash: tokenHash } = await searchParams;
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Neues Passwort festlegen</h1>
      {tokenHash ? (
        <>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">Tippe auf den Knopf, um weiterzugehen.</p>
          <ConfirmPasswordLink tokenHash={tokenHash} />
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Der Link ist unvollständig. <Link href="/passwort-vergessen" className="underline">Neuen Link anfordern</Link></p>
      )}
    </div>
  );
}
