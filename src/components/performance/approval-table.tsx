"use client";
import Link from "next/link";
import { BulkApprove, RowCheckbox } from "@/components/performance/bulk-approve";
import { RecordActions } from "@/components/performance/record-actions";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import type { PerformanceStatus } from "@/lib/metrics";

export type ApprovalRow = {
  id: string; status: PerformanceStatus; product_id: string; occurred_on: string; quantity: number;
  person: string; team: string | null; product: string; external_ref: string | null; note: string | null; created_at: string; duplicateHint: boolean;
};

export function ApprovalTable({ rows, products, today }: { rows: ApprovalRow[]; products: { id: string; name: string }[]; today: string }) {
  return (
    <BulkApprove ids={rows.map((r) => r.id)}>
      {({ selected, toggle }) => (
        <Table>
          <THead>
            <tr>
              <TH className="w-10"><span className="sr-only">Auswahl</span></TH>
              <TH>Datum</TH>
              <TH>Mitarbeiter</TH>
              <TH>Produkt</TH>
              <TH className="text-right">Menge</TH>
              <TH>Vorgangs-ID / Notiz</TH>
              <TH className="text-right">Aktionen</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD><RowCheckbox id={r.id} selected={selected} toggle={toggle} /></TD>
                <TD className="whitespace-nowrap">
                  <Link href={`/leistungen/${r.id}`} className="hover:underline">{formatDate(r.occurred_on)}</Link>
                  <p className="text-xs text-muted-foreground">eingereicht {formatDateTime(r.created_at)}</p>
                </TD>
                <TD className="whitespace-nowrap">{r.person}<p className="text-xs text-muted-foreground">{r.team ?? ""}</p></TD>
                <TD>{r.product}</TD>
                <TD className="text-right font-semibold tabular">{formatNumber(r.quantity)}</TD>
                <TD className="max-w-56 text-xs text-muted-foreground">
                  {r.external_ref ?? "–"}
                  {r.note ? <p className="truncate" title={r.note}>{r.note}</p> : null}
                  {r.duplicateHint ? <p className="font-medium text-warning">Ähnliche Leistung am selben Tag vorhanden</p> : null}
                </TD>
                <TD><RecordActions rec={r} ownerSide={false} canApprove products={products} today={today} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </BulkApprove>
  );
}
