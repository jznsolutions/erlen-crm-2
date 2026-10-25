import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/misc";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/tokens";
import { formatDateTime } from "@/lib/format";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Einladung annehmen" };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = /^[A-Za-z0-9_-]{32,128}$/.test(token);
  const { data } = valid ? await createAdminClient().rpc("invitation_lookup", { p_token_hash: hashToken(token) }) : { data: null };
  const inv = data?.[0];
  if (!inv) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Einladung nicht gültig</h1>
        <Alert tone="warning">Dieser Einladungslink ist ungültig, abgelaufen oder wurde bereits verwendet. Bitte wende dich an deine Führungskraft oder die Administration.</Alert>
        <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">Zur Anmeldung</Link>
      </div>
    );
  }
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Willkommen bei ERLEN, {inv.first_name}!</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Du wurdest als <strong>{inv.role_name}</strong> eingeladen. Lege jetzt dein Passwort fest. Gültig bis {formatDateTime(inv.expires_at)}.
      </p>
      <AcceptForm token={token} email={inv.email} name={`${inv.first_name} ${inv.last_name}`} />
    </div>
  );
}
