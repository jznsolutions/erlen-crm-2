"use client";
import { Check, Trash2, X } from "lucide-react";
import { ConfirmAction } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { deleteEmployeeDocument, reviewEmployeeDocument } from "@/app/(portal)/unterlagen/actions";

export function DocActions({ id, status, manage, own }: { id: string; status: string; manage: boolean; own: boolean }) {
  const canDelete = manage || (own && status !== "geprueft");
  return (
    <>
      {manage && status !== "geprueft" ? (
        <ConfirmAction action={reviewEmployeeDocument} hidden={{ id, status: "geprueft" }} title="Als geprüft markieren?" confirmLabel="Geprüft" tone="success" trigger={<Button size="sm" variant="ghost"><Check />Prüfen</Button>} />
      ) : null}
      {manage && status !== "abgelehnt" ? (
        <ConfirmAction action={reviewEmployeeDocument} hidden={{ id, status: "abgelehnt" }} title="Unterlage ablehnen?" description="Der Mitarbeiter wird benachrichtigt und kann sie neu hochladen." confirmLabel="Ablehnen" tone="danger" reason={{ label: "Grund", required: true, placeholder: "z. B. Foto unscharf, Rückseite fehlt" }} trigger={<Button size="sm" variant="ghost" aria-label="Ablehnen"><X /></Button>} />
      ) : null}
      {canDelete ? (
        <ConfirmAction action={deleteEmployeeDocument} hidden={{ id }} title="Unterlage löschen?" confirmLabel="Löschen" tone="danger" trigger={<Button size="sm" variant="ghost" aria-label="Löschen"><Trash2 /></Button>} />
      ) : null}
    </>
  );
}
