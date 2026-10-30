"use client";
import { useState } from "react";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { cancelStatement, deleteStatementDraft, publishStatement, regeneratePdf, renumberStatement } from "@/app/(portal)/abrechnungen/actions";

function RenumberDialog({ id, number }: { id: string; number: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="ghost">Nummer ändern</Button></DialogTrigger>
      <DialogContent title="Nummer ändern" description="Das PDF wird danach automatisch mit der neuen Nummer erzeugt. Jede Nummer kann nur einmal vergeben werden.">
        <ActionForm action={renumberStatement} onSuccess={() => setOpen(false)} className="space-y-4">
          {({ fieldErrors }) => (
            <>
              <input type="hidden" name="id" value={id} />
              <Field label="Neue Nummer" htmlFor={`rn-${id}`} error={fieldErrors.number}>
                <Input id={`rn-${id}`} name="number" defaultValue={number} required maxLength={40} className="font-mono uppercase" />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Abbrechen</Button>
                <SubmitButton>Speichern</SubmitButton>
              </div>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function StatementActions({ id, status, canRegenerate, number }: { id: string; status: string; canRegenerate: boolean; number?: string | null }) {
  return (
    <>
      {status !== "entwurf" && number ? <RenumberDialog id={id} number={number} /> : null}
      {status === "entwurf" ? (
        <>
          <ConfirmAction action={publishStatement} hidden={{ id }} title="Veröffentlichen?" description="Es wird eine fortlaufende Nummer vergeben, das PDF erzeugt und der Mitarbeiter benachrichtigt." confirmLabel="Veröffentlichen" tone="success" trigger={<Button size="sm">Veröffentlichen</Button>} />
          <ConfirmAction action={deleteStatementDraft} hidden={{ id }} title="Entwurf löschen?" confirmLabel="Löschen" tone="danger" trigger={<Button size="sm" variant="ghost">Löschen</Button>} />
        </>
      ) : null}
      {canRegenerate && status === "veroeffentlicht" ? (
        <ConfirmAction action={regeneratePdf} hidden={{ id }} title="PDF neu erzeugen?" description="Das PDF wird mit den gespeicherten Daten neu erstellt." confirmLabel="Neu erzeugen" trigger={<Button size="sm" variant="ghost">PDF neu</Button>} />
      ) : null}
      {status === "veroeffentlicht" ? (
        <ConfirmAction action={cancelStatement} hidden={{ id }} title="Dokument stornieren?" description="Das Dokument bleibt sichtbar, wird aber als storniert gekennzeichnet. Für eine Korrektur danach neu erstellen." confirmLabel="Stornieren" tone="danger" reason={{ label: "Begründung", required: true }} trigger={<Button size="sm" variant="ghost">Stornieren</Button>} />
      ) : null}
    </>
  );
}
