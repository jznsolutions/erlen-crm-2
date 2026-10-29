import { Download, Eye } from "lucide-react";
import { formatCents, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatementActions } from "./row-actions";

export type StatementRow = {
  id: string;
  kind: "abrechnung" | "gutschrift";
  number: string | null;
  title: string;
  period_from: string | null;
  period_to: string | null;
  issue_date: string;
  gross_cents: number;
  status: "entwurf" | "veroeffentlicht" | "storniert";
  status_reason: string | null;
  storage_path: string | null;
  is_upload: boolean;
  user_name?: string;
};

const STATUS = {
  entwurf: { label: "Entwurf", variant: "neutral" },
  veroeffentlicht: { label: "Veröffentlicht", variant: "success" },
  storniert: { label: "Storniert", variant: "danger" },
} as const;

export function StatementTable({ rows, manage }: { rows: StatementRow[]; manage: boolean }) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Dokument</TH>
          {manage ? <TH>Mitarbeiter</TH> : null}
          <TH>Zeitraum</TH>
          <TH className="text-right">Betrag</TH>
          <TH>Status</TH>
          <TH />
        </tr>
      </THead>
      <TBody>
        {rows.map((s) => (
          <TR key={s.id}>
            <TD>
              <p className="font-medium">{s.title}</p>
              <p className="text-xs text-muted-foreground">
                {s.kind === "abrechnung" ? "Abrechnung" : "Gutschrift"}
                {s.number ? ` · ${s.number}` : ""} · {formatDate(s.issue_date)}
              </p>
            </TD>
            {manage ? <TD className="text-sm">{s.user_name}</TD> : null}
            <TD className="whitespace-nowrap text-sm text-muted-foreground">{s.period_from && s.period_to ? `${formatDate(s.period_from)} – ${formatDate(s.period_to)}` : "–"}</TD>
            <TD className="money text-right font-medium tabular">{s.gross_cents ? formatCents(s.gross_cents) : "–"}</TD>
            <TD>
              <Badge variant={STATUS[s.status].variant}>{STATUS[s.status].label}</Badge>
              {s.status === "storniert" && s.status_reason ? <p className="mt-1 max-w-48 text-xs text-muted-foreground">{s.status_reason}</p> : null}
            </TD>
            <TD className="text-right">
              <div className="flex items-center justify-end gap-1">
                {s.storage_path ? (
                  <>
                    <Button asChild size="sm" variant="ghost"><a href={`/api/abrechnungen/${s.id}`} target="_blank" rel="noopener" aria-label={`${s.title} ansehen`}><Eye />Ansehen</a></Button>
                    <Button asChild size="sm" variant="secondary"><a href={`/api/abrechnungen/${s.id}?download=1`} aria-label={`${s.title} herunterladen`}><Download />PDF</a></Button>
                  </>
                ) : s.status !== "entwurf" ? <span className="text-xs text-muted-foreground">PDF fehlt</span> : null}
                {manage ? <StatementActions id={s.id} status={s.status} canRegenerate={!s.is_upload && s.status !== "entwurf"} /> : null}
              </div>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
