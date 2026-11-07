"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardPaste, ImageUp, Loader2, RefreshCw, Save, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Select, Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import {
  distinctValues, findHeader, guessColumns, guessSeller, guessTarget, parsePastedTable, planRows,
  SYNC_FIELDS, TARGET_LABELS, type ColumnMap, type Mapping, type Person, type SyncField, type Target,
} from "@/lib/partner-sync";
import { readPartnerScreenshot, runPartnerSync, savePartnerMapping, type SyncOutcome } from "@/app/(portal)/leistungen/partner-abgleich/actions";

type Saved = { columns?: ColumnMap; status_map?: Record<string, Target>; product_map?: Record<string, string> };
const ACTION_LABEL: Record<string, string> = { angelegt: "Neu angelegt", bestaetigt: "Bestätigt", storniert: "Storniert", unveraendert: "Unverändert", uebersprungen: "Übersprungen", fehler: "Fehler" };

/** Bild verkleinern (max. 1600 px, JPEG), damit es schnell und günstig gelesen werden kann. */
async function shrink(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

export function PartnerSync({ people, products, saved, today, aiAvailable }: { people: Person[]; products: { id: string; name: string }[]; saved: Saved; today: string; aiAvailable: boolean }) {
  const [raw, setRaw] = useState("");
  const [table, setTable] = useState<string[][] | null>(null);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [columns, setColumns] = useState<ColumnMap>({});
  const [status, setStatus] = useState<Record<string, Target>>({});
  const [prod, setProd] = useState<Record<string, string>>({});
  const [sellers, setSellers] = useState<Record<string, string>>({});
  const [outcomes, setOutcomes] = useState<SyncOutcome[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [reading, startReading] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const headers = table?.[headerIdx] ?? [];

  /** Werte-Zuordnungen aus Gespeichertem bzw. Vorschlägen auffüllen */
  const prefill = (t: string[][], h: number, cols: ColumnMap) => {
    const st: Record<string, Target> = {};
    for (const v of distinctValues(t, h, cols.status)) st[v] = saved.status_map?.[v] ?? guessTarget(v);
    const pr: Record<string, string> = {};
    for (const v of distinctValues(t, h, cols.product)) {
      pr[v] = saved.product_map?.[v] ?? products.find((p) => v.toLowerCase().includes(p.name.toLowerCase()))?.id ?? "";
    }
    const se: Record<string, string> = {};
    for (const v of distinctValues(t, h, cols.seller)) se[v] = guessSeller(v, people) ?? "";
    setStatus(st);
    setProd(pr);
    setSellers(se);
  };

  const analyse = (text: string) => {
    setOutcomes(null);
    setError(null);
    const t = parsePastedTable(text);
    if (t.length < 2) {
      setTable(null);
      setError("Keine Tabelle erkannt. Bitte im Partner-CRM die Liste markieren (Strg+A), kopieren (Strg+C) und hier einfügen (Strg+V).");
      return;
    }
    const h = findHeader(t);
    const cols = guessColumns(t[h], saved.columns);
    setTable(t);
    setHeaderIdx(h);
    setColumns(cols);
    prefill(t, h, cols);
  };

  const setColumn = (f: SyncField, header: string) => {
    const next = { ...columns, [f]: header || undefined };
    setColumns(next);
    if (table) prefill(table, headerIdx, next);
  };

  const mapping: Mapping = { columns, status, products: prod, sellers };
  const rows = useMemo(() => (table ? planRows(table, headerIdx, mapping, today) : []), [table, headerIdx, columns, status, prod, sellers, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = rows.filter((r) => r.target !== "ignorieren" && !r.error);
  const problems = rows.filter((r) => r.error);
  const missingCols = (Object.keys(SYNC_FIELDS) as SyncField[]).filter((f) => SYNC_FIELDS[f].required && !columns[f]);

  const save = () =>
    start(async () => {
      const r = await savePartnerMapping({ columns, status, products: prod, sellers });
      if (r.ok) toast.success(r.message ?? "Gespeichert");
      else toast.error(r.error);
    });

  const run = () =>
    start(async () => {
      setError(null);
      // Zuordnung merken, dann abgleichen
      await savePartnerMapping({ columns, status, products: prod, sellers });
      const r = await runPartnerSync(
        ready.map((x) => ({ user_id: x.user_id, product_id: x.product_id, occurred_on: x.occurred_on, quantity: x.quantity, ref: x.ref, target: x.target })),
      );
      if (r.ok) setOutcomes(r.outcomes);
      else setError(r.error);
    });

  const onScreenshot = (file: File) =>
    startReading(async () => {
      setError(null);
      try {
        const dataUrl = await shrink(file);
        const r = await readPartnerScreenshot(dataUrl);
        if (!r.ok) return setError(r.error);
        const tsv = [r.headers, ...r.rows].map((row) => row.join("\t")).join("\n");
        setRaw(tsv);
        analyse(tsv);
        toast.success(`${r.rows.length} Zeilen aus dem Screenshot gelesen – bitte prüfen.`);
      } catch {
        setError("Das Bild konnte nicht gelesen werden.");
      }
    });

  if (outcomes) {
    const count = (a: string) => outcomes.filter((o) => o.action === a).length;
    const failed = outcomes.filter((o) => o.action === "fehler" || o.action === "uebersprungen");
    return (
      <div className="space-y-4" data-testid="sync-result">
        <Alert tone={count("fehler") ? "warning" : "success"} title="Abgleich abgeschlossen">
          {count("angelegt")} neu · {count("bestaetigt")} bestätigt · {count("storniert")} storniert · {count("unveraendert")} unverändert
          {failed.length ? ` · ${failed.length} nicht übernommen` : ""}
        </Alert>
        {failed.length ? (
          <ul className="space-y-1 text-sm">
            {failed.map((o) => {
              const r = ready[o.idx - 1];
              return <li key={o.idx} className="flex gap-2"><XCircle className="mt-0.5 size-4 shrink-0 text-danger" />{r?.ref ?? `Zeile ${o.idx}`}: {o.message ?? ACTION_LABEL[o.action]}</li>;
            })}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button asChild><Link href="/leistungen">Zu den Leistungen</Link></Button>
          <Button variant="secondary" onClick={() => { setOutcomes(null); setTable(null); setRaw(""); }}><RefreshCw />Neuer Abgleich</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text/plain");
            if (t) {
              e.preventDefault();
              setRaw(t);
              analyse(t);
            }
          }}
          rows={6}
          placeholder="Im Partner-CRM die Auftragsliste markieren (Strg+A) und kopieren (Strg+C) – dann hier klicken und einfügen (Strg+V)."
          aria-label="Kopierte Liste aus dem Partner-CRM"
          className="font-mono text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => analyse(raw)} disabled={!raw.trim()}><ClipboardPaste />Liste prüfen</Button>
          {aiAvailable ? (
            <>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="Screenshot auswählen" onChange={(e) => e.target.files?.[0] && onScreenshot(e.target.files[0])} />
              <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={reading}>{reading ? <Loader2 className="animate-spin" /> : <ImageUp />}Screenshot hochladen</Button>
            </>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">Datenschutz: Die Liste wird in deinem Browser ausgewertet. Ans Portal gehen nur Auftragsnummer, Verkäufer, Produkt, Datum und Status – Kundennamen, Adressen und Telefonnummern werden nicht übernommen.</p>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {table ? (
        <>
          <section className="space-y-3">
            <h3 className="font-semibold">1. Welche Spalte ist was?</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.keys(SYNC_FIELDS) as SyncField[]).map((f) => (
                <label key={f} className="text-sm">
                  <span className="mb-1 block text-muted-foreground">{SYNC_FIELDS[f].label}</span>
                  <Select value={columns[f] ?? ""} onChange={(e) => setColumn(f, e.target.value)} aria-label={`Spalte ${SYNC_FIELDS[f].label}`}>
                    <option value="">{SYNC_FIELDS[f].required ? "– bitte wählen –" : "– keine –"}</option>
                    {headers.map((h, i) => h ? <option key={i} value={h}>{h}</option> : null)}
                  </Select>
                </label>
              ))}
            </div>
            {missingCols.length ? <Alert tone="warning">Bitte noch zuordnen: {missingCols.map((f) => SYNC_FIELDS[f].label).join(", ")}</Alert> : null}
          </section>

          {!missingCols.length ? (
            <>
              <section className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-2">
                  <h3 className="font-semibold">2. Status</h3>
                  {Object.keys(status).map((v) => (
                    <label key={v} className="block text-sm">
                      <span className="mb-1 block">„{v}“</span>
                      <Select value={status[v]} onChange={(e) => setStatus({ ...status, [v]: e.target.value as Target })} aria-label={`Status ${v}`}>
                        {(Object.keys(TARGET_LABELS) as Target[]).map((t) => <option key={t} value={t}>{TARGET_LABELS[t]}</option>)}
                      </Select>
                    </label>
                  ))}
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold">3. Produkte</h3>
                  {Object.keys(prod).map((v) => (
                    <label key={v} className="block text-sm">
                      <span className="mb-1 block">„{v}“</span>
                      <Select value={prod[v]} onChange={(e) => setProd({ ...prod, [v]: e.target.value })} aria-label={`Produkt ${v}`}>
                        <option value="">– nicht übernehmen –</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </Select>
                    </label>
                  ))}
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold">4. Verkäufer</h3>
                  {Object.keys(sellers).map((v) => (
                    <label key={v} className="block text-sm">
                      <span className="mb-1 block">„{v}“</span>
                      <Select value={sellers[v]} onChange={(e) => setSellers({ ...sellers, [v]: e.target.value })} aria-label={`Verkäufer ${v}`}>
                        <option value="">– nicht zuordnen –</option>
                        {people.map((p) => <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>)}
                      </Select>
                    </label>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-semibold">5. Vorschau</h3>
                  <Badge variant="success"><CheckCircle2 className="size-3" />{ready.length} bereit</Badge>
                  {problems.length ? <Badge variant="danger">{problems.length} mit Problem</Badge> : null}
                  <Badge>{rows.filter((r) => r.target === "ignorieren").length} ignoriert</Badge>
                </div>
                <div className="max-h-96 overflow-auto rounded-xl border border-white/10">
                  <Table>
                    <THead><tr><TH>Auftrag</TH><TH>Verkäufer</TH><TH>Produkt</TH><TH>Datum</TH><TH>Wird</TH><TH>Hinweis</TH></tr></THead>
                    <TBody>
                      {rows.map((r) => {
                        const person = people.find((p) => p.id === r.user_id);
                        return (
                          <TR key={r.line} className={r.error ? "bg-danger-soft/40" : r.target === "ignorieren" ? "opacity-50" : undefined}>
                            <TD className="font-mono text-xs">{r.ref || "–"}</TD>
                            <TD>{person ? `${person.first_name} ${person.last_name}` : r.sellerRaw}</TD>
                            <TD>{products.find((p) => p.id === r.product_id)?.name ?? r.productRaw}</TD>
                            <TD className="whitespace-nowrap">{r.occurred_on ? formatDate(r.occurred_on) : r.dateRaw}</TD>
                            <TD>{r.target === "ignorieren" ? "ignoriert" : r.target === "bestaetigt" ? "bestätigt" : r.target === "storniert" ? "storniert" : "in Prüfung"}</TD>
                            <TD className="text-xs text-danger">{r.error ?? ""}</TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="lg" onClick={run} disabled={pending || !ready.length}>{pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}Abgleich starten ({ready.length})</Button>
                  <Button variant="secondary" onClick={save} disabled={pending}><Save />Nur Zuordnung speichern</Button>
                </div>
                <p className="text-xs text-muted-foreground">Neue Aufträge werden angelegt, „bestätigt“ zählt sofort, „storniert“ storniert bei uns. Bereits übernommene Aufträge (gleiche Auftragsnummer) werden nur aktualisiert – nie doppelt angelegt. Die Zuordnungen werden gespeichert, beim nächsten Mal genügt Einfügen und „Abgleich starten“.</p>
              </section>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
