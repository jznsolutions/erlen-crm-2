import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ExternalLink, FileText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { SignForm } from "@/components/contracts/sign-form";

export const metadata: Metadata = { title: "Vertrag unterschreiben" };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await requireUser();
  const supabase = await createClient();
  const { data: req } = await supabase
    .from("contract_requests")
    .select("id, user_id, status, signed_at, signed_name, employee_document_id, contract_templates(title)")
    .eq("id", id)
    .maybeSingle();
  if (!req || req.user_id !== user.id) notFound();
  const title = req.contract_templates?.title ?? "Vertrag";
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={title} description="Bitte zuerst den Vertrag lesen, dann unten unterschreiben." />
      <Card>
        <CardHeader><div><CardTitle className="flex items-center gap-2"><FileText className="size-4" />1. Vertrag lesen</CardTitle><CardDescription>Öffnet sich als PDF in einem neuen Fenster.</CardDescription></div></CardHeader>
        <CardContent>
          <a href={`/api/vertrag/${req.id}`} target="_blank" rel="noopener" className={buttonVariants({ variant: "secondary" })}><ExternalLink />Vertrag öffnen (PDF)</a>
        </CardContent>
      </Card>
      {req.status === "offen" ? (
        <Card>
          <CardHeader><div><CardTitle>2. Unterschreiben</CardTitle><CardDescription>Dein unterschriebenes Exemplar wird automatisch unter „Meine Unterlagen“ gespeichert.</CardDescription></div></CardHeader>
          <CardContent><SignForm requestId={req.id} defaultName={`${user.firstName} ${user.lastName}`} /></CardContent>
        </Card>
      ) : req.status === "unterschrieben" ? (
        <Alert tone="success" title="Unterschrieben">
          <span className="flex items-center gap-2"><CheckCircle2 className="size-4" />Am {formatDateTime(req.signed_at)} von {req.signed_name}.</span>
          {req.employee_document_id ? <Link className="underline" href={`/api/unterlagen/${req.employee_document_id}?download=1`}>Unterschriebenes PDF herunterladen</Link> : null}
        </Alert>
      ) : (
        <Alert tone="info">Dieser Vertrag wurde von der Agentur zurückgezogen.</Alert>
      )}
    </div>
  );
}
