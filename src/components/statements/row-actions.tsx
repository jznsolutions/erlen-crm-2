"use client";
import { ConfirmAction } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { cancelStatement, deleteStatementDraft, publishStatement, regeneratePdf } from "@/app/(portal)/abrechnungen/actions";

export function StatementActions({ id, status, canRegenerate }: { id: string; status: string; canRegenerate: boolean }) {
  return (
    <>
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
