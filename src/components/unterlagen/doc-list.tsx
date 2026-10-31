import { Eye, FileText, ImageIcon } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/format";
import { docCategoryLabel } from "@/lib/employee-docs";
import { addDays, todayBerlin } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocActions } from "./doc-actions";

export type DocRow = {
  id: string;
  user_id: string;
  category: string;
  title: string | null;
  file_name: string;
  mime_type: string;
  valid_until: string | null;
  status: "eingereicht" | "geprueft" | "abgelehnt";
  review_note: string | null;
  created_at: string;
  owner_name?: string;
};

const STATUS = {
  eingereicht: { label: "In Prüfung", variant: "info" },
  geprueft: { label: "Geprüft", variant: "success" },
  abgelehnt: { label: "Abgelehnt", variant: "danger" },
} as const;

export function DocList({ docs, manage, selfId, showOwner = false }: { docs: DocRow[]; manage: boolean; selfId: string; showOwner?: boolean }) {
  const today = todayBerlin();
  return (
    <ul className="divide-y">
      {docs.map((d) => {
        const Icon = d.mime_type === "application/pdf" ? FileText : ImageIcon;
        const expired = d.valid_until && d.valid_until < today;
        const soon = !expired && d.valid_until && d.valid_until <= addDays(today, 30);
        return (
          <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <Icon className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{showOwner && d.owner_name ? `${d.owner_name} · ` : ""}{docCategoryLabel(d.category)}{d.title ? ` – ${d.title}` : ""}</p>
              <p className="truncate text-xs text-muted-foreground">
                {d.file_name} · {formatDateTime(d.created_at)}
                {d.valid_until ? <span className={expired ? " font-medium text-danger" : soon ? " font-medium text-warning" : ""}> · gültig bis {formatDate(d.valid_until)}{expired ? " (abgelaufen)" : soon ? " (läuft bald ab)" : ""}</span> : null}
              </p>
              {d.status === "abgelehnt" && d.review_note ? <p className="mt-1 text-xs text-danger">Grund: {d.review_note}</p> : null}
            </div>
            <Badge variant={STATUS[d.status].variant}>{STATUS[d.status].label}</Badge>
            <div className="flex items-center gap-1">
              <Button asChild size="sm" variant="ghost"><a href={`/api/unterlagen/${d.id}`} target="_blank" rel="noopener" aria-label={`${docCategoryLabel(d.category)} ansehen`}><Eye />Ansehen</a></Button>
              <DocActions id={d.id} status={d.status} manage={manage} own={d.user_id === selfId} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
