"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { formatCents } from "@/lib/format";
import { runMonthClose } from "@/app/(portal)/abrechnungen/actions";

export type MonthRow = {
  userId: string;
  name: string;
  provisionen: number;
  differenz: number;
  vermittlung: number;
  einbehaltVormonat: number;
  abzuege: number;
  zuschlaege: number;
  gesamt: number;
  newAbrechnung: boolean;
  selectable: boolean;
  hints: string[];
};

export function MonthCloseForm({ month, retention, rows }: { month: string; retention: number; rows: MonthRow[] }) {
  const [picked, setPicked] = useState<string[]>(rows.filter((r) => r.selectable).map((r) => r.userId));
  const [report, setReport] = useState<{ done: string[]; failed: string[] } | null>(null);
  const router = useRouter();
  const total = rows.filter((r) => picked.includes(r.userId)).reduce((a, r) => a + r.gesamt, 0);
  const selectable = rows.filter((r) => r.selectable);
  return (
    <ActionForm
      action={runMonthClose}
      onSuccess={(r) => {
        if (r.ok) setReport(r.data as { done: string[]; failed: string[] });
        router.refresh();
      }}
      className="space-y-4"
    >
      <input type="hidden" name="month" value={month} />
      {picked.map((id) => <input key={id} type="hidden" name="user_ids" value={id} />)}
      <div className="overflow-x-auto">
        <table className="money w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2">
                <input type="checkbox" aria-label="Alle auswählen" className="size-4 accent-[var(--primary)]" checked={picked.length === selectable.length && selectable.length > 0} onChange={(e) => setPicked(e.target.checked ? selectable.map((r) => r.userId) : [])} />
              </th>
              <th className="px-2 py-2">Mitarbeiter</th>
              <th className="px-2 py-2 text-right">Provisionen</th>
              <th className="px-2 py-2 text-right">Differenz</th>
              <th className="px-2 py-2 text-right">Vermittlung</th>
              <th className="px-2 py-2 text-right">Einbehalt VM</th>
              <th className="px-2 py-2 text-right">Abzüge</th>
              <th className="px-2 py-2 text-right">Gesamt</th>
              <th className="px-4 py-2">Hinweise</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.userId} className={r.selectable ? "" : "opacity-50"}>
                <td className="px-4 py-2">
                  <input type="checkbox" aria-label={`${r.name} abrechnen`} className="size-4 accent-[var(--primary)]" disabled={!r.selectable} checked={picked.includes(r.userId)} onChange={(e) => setPicked((xs) => (e.target.checked ? [...xs, r.userId] : xs.filter((x) => x !== r.userId)))} />
                </td>
                <td className="px-2 py-2 font-medium">{r.name}</td>
                <td className="px-2 py-2 text-right tabular">{formatCents(r.provisionen)}</td>
                <td className="px-2 py-2 text-right tabular">{formatCents(r.differenz)}</td>
                <td className="px-2 py-2 text-right tabular">{formatCents(r.vermittlung)}</td>
                <td className="px-2 py-2 text-right tabular">{formatCents(r.einbehaltVormonat)}</td>
                <td className="px-2 py-2 text-right tabular text-danger">{r.abzuege ? `−${formatCents(r.abzuege)}` : "–"}</td>
                <td className="px-2 py-2 text-right font-semibold tabular">{formatCents(r.gesamt)}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{r.hints.join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4 px-5">
        <Field label="Stornobehalt (%)" htmlFor="mc-ret" hint="für alle ausgewählten Gutschriften"><Input id="mc-ret" name="retention_rate" defaultValue={retention} inputMode="decimal" className="w-28 text-right" /></Field>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">{picked.length} ausgewählt · Summe <span className="money font-semibold text-foreground">{formatCents(total)}</span></p>
          <SubmitButton className="mt-2" disabled={!picked.length} pendingText="Wird erstellt … (kann 1–2 Minuten dauern)">Abrechnungen & Gutschriften erstellen</SubmitButton>
        </div>
      </div>
      {report ? (
        <div className="space-y-2 px-5">
          {report.done.length ? <Alert tone="success" title={`${report.done.length} erstellt`}>{report.done.join(", ")}</Alert> : null}
          {report.failed.length ? <Alert tone="warning" title="Nicht erstellt">{report.failed.join(" · ")}</Alert> : null}
        </div>
      ) : null}
    </ActionForm>
  );
}
