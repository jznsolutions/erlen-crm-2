"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Checkbox, Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { TEMPLATE_HEADER, type CheckedRow } from "@/lib/performance-import";
import { previewImport, runImport, type ImportOutcome } from "@/app/(portal)/leistungen/import/actions";

export function PerformanceImport({ exampleProduct, productNames }: { exampleProduct: string; productNames: string[] }) {
  const [rows, setRows] = useState<CheckedRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [outcomes, setOutcomes] = useState<ImportOutcome[] | null>(null);
  const [pending, start] = useTransition();
  const valid = useMemo(() => (rows ?? []).filter((r) => !r.error), [rows]);
  const invalid = (rows?.length ?? 0) - valid.length;

  const template = () => {
    const csv = "﻿" + [TEMPLATE_HEADER.join(";"), `max.mustermann@beispiel.de;${exampleProduct};31.10.2026;1;V-12345;`].join("\r\n") + "\r\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "leistungen-vorlage.csv" });
    a.click();
    URL.revokeObjectURL(url);
  };

  const check = (fd: FormData) =>
    start(async () => {
      setError(null);
      setOutcomes(null);
      const r = await previewImport(fd);
      if (r.ok) {
        setRows(r.rows);
        setFileName(r.fileName);
      } else {
        setRows(null);
        setError(r.error);
      }
    });

  const doImport = () =>
    start(async () => {
      setError(null);
      const r = await runImport({
        rows: valid.map((v) => ({ line: v.line, userId: v.userId, productId: v.productId, date: v.date, quantity: v.quantity, ref: v.ref, note: v.note })),
        allowDuplicates,
      });
      if (r.ok) setOutcomes(r.outcomes);
      else setError(r.error);
    });

  if (outcomes) {
    const ok = outcomes.filter((o) => o.status === "ok");
    const confirmed = ok.filter((o) => o.recordStatus === "bestaetigt").length;
    const problems = outcomes.filter((o) => o.status !== "ok");
    return (
      <div className="space-y-4">
        <Alert tone={problems.length ? "warning" : "success"} title={`${ok.length} von ${outcomes.length} Leistungen übernommen`}>
          {confirmed ? `${confirmed} direkt bestätigt` : null}
          {confirmed && ok.length - confirmed ? ", " : null}
          {ok.length - confirmed ? `${ok.length - confirmed} zur Freigabe eingereicht` : null}
          {problems.length ? `. ${problems.length} Zeile(n) wurden nicht übernommen – siehe Liste.` : "."}
        </Alert>
        {problems.length ? (
          <ul className="space-y-1 text-sm" data-testid="import-problems">
            {problems.map((p) => (
              <li key={p.line} className="flex gap-2"><XCircle className="mt-0.5 size-4 shrink-0 text-danger" />Zeile {p.line}: {p.status === "duplikat" ? "schon vorhanden (Duplikat) – " : ""}{p.message}</li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button asChild><Link href="/leistungen">Zu den Leistungen</Link></Button>
          <Button variant="secondary" onClick={() => { setOutcomes(null); setRows(null); }}>Weitere Datei importieren</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2 text-sm text-muted-foreground">
        <p><b className="text-foreground">So geht’s:</b> Excel-Datei mit diesen Spalten in der ersten Zeile: <b>Mitarbeiter</b> (E-Mail oder Mitarbeiter-ID, notfalls „Vorname Nachname“), <b>Produkt</b> (genau wie im Portal), <b>Datum</b>, <b>Menge</b> (leer = 1), optional <b>Vorgangs-ID</b> und <b>Notiz</b>.</p>
        <p>Produkte im Portal: {productNames.join(", ") || "–"}</p>
        <p>Nichts wird gespeichert, bevor du die Vorschau geprüft und auf „Importieren“ getippt hast. Doppelte Vorgangs-IDs werden automatisch erkannt.</p>
      </div>
      <Button type="button" variant="secondary" onClick={template}><Download />Vorlage herunterladen</Button>
      <form action={check} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input type="file" name="file" accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" required className="sm:max-w-sm" aria-label="Datei" />
        <Button type="submit" disabled={pending}>{pending && !rows ? <Loader2 className="animate-spin" /> : <Upload />}Datei prüfen</Button>
      </form>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {rows ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5"><FileSpreadsheet className="size-4" />{fileName}</span>
            <span className="inline-flex items-center gap-1.5 text-success"><CheckCircle2 className="size-4" />{valid.length} in Ordnung</span>
            {invalid ? <span className="inline-flex items-center gap-1.5 text-danger"><XCircle className="size-4" />{invalid} mit Fehler (werden übersprungen)</span> : null}
          </div>
          <div className="max-h-[28rem] overflow-auto rounded-xl border">
            <Table>
              <THead><TR><TH>Zeile</TH><TH>Mitarbeiter</TH><TH>Produkt</TH><TH>Datum</TH><TH className="text-right">Menge</TH><TH>Vorgangs-ID</TH><TH>Prüfung</TH></TR></THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.line} className={r.error ? "bg-danger-soft/40" : undefined}>
                    <TD>{r.line}</TD>
                    <TD>{r.userLabel ?? r.employee}</TD>
                    <TD>{r.productLabel ?? r.product}</TD>
                    <TD>{r.date ? formatDate(r.date) : r.rawDate}</TD>
                    <TD className="text-right">{r.quantity ?? r.rawQuantity}</TD>
                    <TD>{r.ref ?? "–"}</TD>
                    <TD className={r.error ? "text-danger" : "text-success"}>{r.error ?? "OK"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={allowDuplicates} onChange={(e) => setAllowDuplicates(e.target.checked)} className="mt-0.5" />
            <span>Auch übernehmen, wenn es schon eine gleiche Leistung (Mitarbeiter, Produkt, Datum, Menge) ohne Vorgangs-ID gibt. <span className="text-muted-foreground">Gleiche Vorgangs-IDs werden nie doppelt übernommen.</span></span>
          </label>
          <Button onClick={doImport} disabled={pending || valid.length === 0} size="lg">
            {pending ? <Loader2 className="animate-spin" /> : <Upload />}
            {valid.length} Leistung{valid.length === 1 ? "" : "en"} importieren
          </Button>
        </div>
      ) : null}
    </div>
  );
}
