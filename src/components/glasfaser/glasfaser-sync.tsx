"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, ImageUp, Loader2, Save, Undo2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Select, Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { dedupeRows, groupContracts, parseGfTable, type GfRow } from "@/lib/glasfaser-sync";
import { parsePastedTable, type Person } from "@/lib/partner-sync";
import {
  applyGlasfaserStornos, readStornoFile, saveGlasfaserMapping, uploadGlasfaser, type GfOutcome, type GfStornoOutcome,
} from "@/app/(portal)/leistungen/glasfaser/actions";

type Opt = { value: string; label: string };

/** Screenshots (mehrere) im Browser lesen → Tabellenzeilen. Kostenlos, das Bild verlässt den Rechner nicht. */
async function readImages(files: File[], onProgress: (t: string) => void): Promise<GfRow[]> {
  const { readTableFromImage } = await import("@/lib/partner-ocr-browser");
  const out: GfRow[] = [];
  for (const [i, f] of files.entries()) {
    onProgress(`Bild ${i + 1} von ${files.length} wird gelesen …`);
    out.push(...parseGfTable(await readTableFromImage(f)));
  }
  return out;
}

/** Eingabe: Screenshots wählen/einfügen/hineinziehen oder Liste einfügen */
function Intake({ label, onRows, allowFile }: { label: string; onRows: (rows: GfRow[]) => void; allowFile?: boolean }) {
  const imgRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const take = async (rows: GfRow[] | Promise<GfRow[]>) => {
    setError(null);
    try {
      const r = await rows;
      if (!r.length) setError("Keine Liste erkannt. Bitte die Tabelle mit Kopfzeile (Datum, Partner, Produktname …) aufnehmen.");
      else onRows(r);
    } catch {
      setError("Die Liste konnte nicht gelesen werden.");
    } finally {
      setBusy(null);
    }
  };
  const images = (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (imgs.length) void take(readImages(imgs, setBusy));
  };
  return (
    <div className="space-y-2">
      <div
        className="rounded-2xl border-2 border-dashed border-white/15 p-5 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          images([...e.dataTransfer.files]);
        }}
      >
        <input ref={imgRef} type="file" accept="image/*" multiple className="hidden" aria-label={`${label}: Screenshots auswählen`} onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; images(f); }} />
        {allowFile ? (
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,.txt"
            className="hidden"
            aria-label={`${label}: Datei auswählen`}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setBusy("Datei wird gelesen …");
              const fd = new FormData();
              fd.set("file", f);
              const r = await readStornoFile(fd);
              if (!r.ok) {
                setBusy(null);
                setError(r.error);
              } else void take(parseGfTable(r.table));
            }}
          />
        ) : null}
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="lg" onClick={() => imgRef.current?.click()} disabled={!!busy}>{busy ? <Loader2 className="animate-spin" /> : <ImageUp />}{busy ?? "Screenshots auswählen"}</Button>
          {allowFile ? <Button size="lg" variant="secondary" onClick={() => fileRef.current?.click()} disabled={!!busy}><Upload />Excel/CSV</Button> : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Auch: Bilder hineinziehen. Kostenlos – die Bilder werden in deinem Browser gelesen.</p>
      </div>
      <Textarea
        rows={2}
        placeholder="… oder die Liste markieren, kopieren (Strg+C) und hier einfügen (Strg+V)"
        aria-label={`${label}: Liste einfügen`}
        onPaste={(e) => {
          const imgs = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
          if (imgs.length) {
            e.preventDefault();
            images(imgs);
            return;
          }
          const t = e.clipboardData.getData("text/plain");
          if (t) {
            e.preventDefault();
            void take(parseGfTable(parsePastedTable(t)));
          }
        }}
        className="text-xs"
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}

const personName = (p?: Person) => (p ? `${p.first_name} ${p.last_name}` : "");

export function GlasfaserSync({
  me, isApprover, people, options, productMap, unknown,
}: {
  me: { id: string; partnerId: string | null };
  isApprover: boolean;
  people: Person[];
  options: Opt[];
  productMap: Record<string, string>;
  unknown: string[];
}) {
  // ---------- Verträge hochladen ----------
  const [rows, setRows] = useState<GfRow[]>([]);
  const [sellerFor, setSellerFor] = useState<Record<string, string>>({});
  const [outcomes, setOutcomes] = useState<{ groups: ReturnType<typeof groupContracts>; res: GfOutcome[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const groups = useMemo(() => groupContracts(rows), [rows]);
  const byPartner = (partner: string) => people.find((p) => p.partner_seller_id && p.partner_seller_id.toLowerCase() === partner.toLowerCase())?.id;
  const sellerOf = (partner: string) =>
    sellerFor[partner.toLowerCase()] ?? byPartner(partner) ?? (!partner || (me.partnerId && me.partnerId.toLowerCase() === partner.toLowerCase()) ? me.id : "");
  const total = groups.reduce((s, g) => s + g.count, 0);
  const missingSeller = isApprover && groups.some((g) => !sellerOf(g.partner));

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await uploadGlasfaser(groups.map((g) => ({ partner: g.partner, product_name: g.product, date: g.date, count: g.count, user_id: isApprover ? sellerOf(g.partner) || null : null })));
      if (r.ok) {
        setOutcomes({ groups, res: r.outcomes });
        setRows([]);
      } else setError(r.error);
    });

  // ---------- Produktzuordnung (Leitung) ----------
  const names = [...new Set([...unknown, ...Object.keys(productMap), ...groups.map((g) => g.product)])].sort((a, b) => a.localeCompare(b, "de"));
  const [map, setMap] = useState<Record<string, string>>(productMap);
  const [saving, startSaving] = useTransition();

  // ---------- Stornoliste (Leitung) ----------
  const [stornoRows, setStornoRows] = useState<GfRow[]>([]);
  const [stornoSeller, setStornoSeller] = useState<Record<number, string>>({});
  const [stornoRes, setStornoRes] = useState<{ rows: GfRow[]; res: GfStornoOutcome[] } | null>(null);
  const [stornoErr, setStornoErr] = useState<string | null>(null);
  const [stornoPending, startStorno] = useTransition();
  const stornoUser = (i: number, r: GfRow) => stornoSeller[i] ?? byPartner(r.partner) ?? "";
  const submitStornos = () =>
    startStorno(async () => {
      setStornoErr(null);
      const r = await applyGlasfaserStornos(stornoRows.map((x, i) => ({ user_id: stornoUser(i, x), product_name: x.product, date: x.date })));
      if (r.ok) {
        setStornoRes({ rows: stornoRows, res: r.outcomes });
        setStornoRows([]);
        setStornoSeller({});
      } else setStornoErr(r.error);
    });

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{isApprover ? "Verträge hochladen" : "Meine Verträge hochladen"}</h2>
          <p className="text-sm text-muted-foreground">
            Im Partner-CRM die Auftragsliste öffnen, einen Screenshot machen (bei mehreren Seiten: jede Seite) und hier hochladen. Neue Verträge werden automatisch gebucht –
            dieselbe Liste noch einmal hochzuladen schadet nicht.
          </p>
        </div>
        {outcomes ? (
          <div className="space-y-3" data-testid="gf-result">
            <Alert tone={outcomes.res.some((o) => o.message) ? "warning" : "success"} title="Übernommen">
              {outcomes.res.reduce((s, o) => s + o.added, 0)} neue Verträge gebucht
            </Alert>
            <ul className="space-y-1 text-sm">
              {outcomes.res.map((o) => {
                const g = outcomes.groups[o.idx - 1];
                return (
                  <li key={o.idx} className="flex gap-2">
                    {o.message ? <XCircle className="mt-0.5 size-4 shrink-0 text-danger" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />}
                    {g ? `${formatDate(g.date)} · ${g.product}: ` : ""}{o.added ? `+${o.added} neu` : o.message ? "" : "bereits übernommen"}{o.message ? o.message : ""}
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button asChild><Link href="/dashboard">Zum Dashboard</Link></Button>
              <Button variant="secondary" onClick={() => setOutcomes(null)}>Weitere Screenshots</Button>
            </div>
          </div>
        ) : (
          <>
            <Intake label="Verträge" onRows={(r) => setRows((old) => [...old, ...r])} />
            {groups.length ? (
              <div className="space-y-3">
                <div className="overflow-auto rounded-xl border border-white/10">
                  <Table>
                    <THead><tr><TH>Datum</TH><TH>Produkt</TH><TH>Partner</TH>{isApprover ? <TH>Mitarbeiter</TH> : null}<TH className="text-right">Verträge</TH></tr></THead>
                    <TBody>
                      {groups.map((g) => (
                        <TR key={`${g.partner}|${g.date}|${g.product}`} data-testid="gf-group">
                          <TD className="whitespace-nowrap">{formatDate(g.date)}</TD>
                          <TD>{g.product}</TD>
                          <TD className="font-mono text-xs">{g.partner || "–"}</TD>
                          {isApprover ? (
                            <TD>
                              <Select value={sellerOf(g.partner)} onChange={(e) => setSellerFor({ ...sellerFor, [g.partner.toLowerCase()]: e.target.value })} aria-label={`Mitarbeiter ${g.partner || "ohne Kennung"}`}>
                                <option value="">– wählen –</option>
                                {people.map((p) => <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>)}
                              </Select>
                            </TD>
                          ) : null}
                          <TD className="text-right font-semibold tabular">{g.count}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
                {!isApprover && me.partnerId && groups.some((g) => g.partner && g.partner.toLowerCase() !== me.partnerId!.toLowerCase()) ? (
                  <Alert tone="warning">Einige Zeilen gehören zu einer anderen Partner-Kennung als deiner ({me.partnerId}) – sie werden nicht übernommen.</Alert>
                ) : null}
                {missingSeller ? <Alert tone="warning">Bitte jeder Partner-Kennung einen Mitarbeiter zuordnen.</Alert> : null}
                {error ? <Alert tone="danger">{error}</Alert> : null}
                <div className="flex flex-wrap gap-2">
                  <Button size="lg" onClick={submit} disabled={pending || missingSeller}>{pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Übernehmen ({total} Verträge in der Liste)</Button>
                  <Button variant="ghost" onClick={() => setRows([])}>Verwerfen</Button>
                </div>
                <p className="text-xs text-muted-foreground">Gebucht werden nur Verträge, die noch nicht übernommen sind (gezählt je Tag und Produkt). Kundenadressen werden nicht gespeichert. Stornierte Zeilen zählen nicht.</p>
              </div>
            ) : null}
          </>
        )}
      </section>

      {isApprover ? (
        <>
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Produkte zuordnen</h2>
              <p className="text-sm text-muted-foreground">
                Welcher Tarif im Partner-CRM ist welches Glasfaser-Produkt (bzw. welche Provisionsstufe)? „Automatisch“ klappt, wenn es nur ein Glasfaser-Produkt gibt oder die Stufe die Zahl aus dem Tarif im Namen trägt (z. B. „1000“).
              </p>
            </div>
            {unknown.length ? <Alert tone="warning">Noch nicht zugeordnet (aus Uploads): {unknown.join(", ")}</Alert> : null}
            {names.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {names.map((n) => (
                  <label key={n} className="text-sm">
                    <span className="mb-1 block">„{n}“</span>
                    <Select value={map[n] ?? ""} onChange={(e) => setMap({ ...map, [n]: e.target.value })} aria-label={`Tarif ${n}`}>
                      <option value="">– automatisch –</option>
                      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  </label>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">Tarife erscheinen hier nach dem ersten Upload.</p>}
            {names.length ? (
              <Button
                variant="secondary"
                disabled={saving}
                onClick={() =>
                  startSaving(async () => {
                    const r = await saveGlasfaserMapping(map);
                    if (r.ok) toast.success(r.message ?? "Gespeichert");
                    else toast.error(r.error);
                  })
                }
              >
                <Save />Zuordnung speichern
              </Button>
            ) : null}
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Stornoliste (Monatsende)</h2>
              <p className="text-sm text-muted-foreground">
                Liste der Stornos aus dem Partner-CRM hochladen (Screenshot, Excel/CSV oder kopiert). Je Zeile wird der passende Vertrag des Mitarbeiters storniert
                (gleicher Tag und Tarif) – in der nächsten Abrechnung wird er automatisch abgezogen.
              </p>
            </div>
            {stornoRes ? (
              <div className="space-y-2" data-testid="gf-storno-result">
                <Alert tone={stornoRes.res.some((o) => o.action !== "storniert") ? "warning" : "success"} title="Stornos gebucht">
                  {stornoRes.res.filter((o) => o.action === "storniert").length} storniert · {stornoRes.res.filter((o) => o.action !== "storniert").length} nicht zugeordnet
                </Alert>
                <ul className="space-y-1 text-sm">
                  {stornoRes.res.filter((o) => o.action !== "storniert").map((o) => {
                    const r = stornoRes.rows[o.idx - 1];
                    return <li key={o.idx} className="flex gap-2"><XCircle className="mt-0.5 size-4 shrink-0 text-danger" />{r ? `${r.date ? formatDate(r.date) : "–"} · ${r.partner} · ${r.product}: ` : ""}{o.message}</li>;
                  })}
                </ul>
                <Button variant="secondary" onClick={() => setStornoRes(null)}>Weitere Stornoliste</Button>
              </div>
            ) : (
              <>
                <Intake label="Stornoliste" allowFile onRows={(r) => setStornoRows((old) => dedupeRows([...old, ...r]))} />
                {stornoRows.length ? (
                  <div className="space-y-3">
                    <div className="max-h-96 overflow-auto rounded-xl border border-white/10">
                      <Table>
                        <THead><tr><TH>Datum</TH><TH>Partner</TH><TH>Tarif</TH><TH>Mitarbeiter</TH></tr></THead>
                        <TBody>
                          {stornoRows.map((r, i) => (
                            <TR key={i} data-testid="gf-storno-row">
                              <TD className="whitespace-nowrap">{r.date ? formatDate(r.date) : "–"}</TD>
                              <TD className="font-mono text-xs">{r.partner || "–"}</TD>
                              <TD>{r.product}</TD>
                              <TD>
                                <Select value={stornoUser(i, r)} onChange={(e) => setStornoSeller({ ...stornoSeller, [i]: e.target.value })} aria-label={`Storno Mitarbeiter ${i + 1}`}>
                                  <option value="">– wählen –</option>
                                  {people.map((p) => <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>)}
                                </Select>
                                {byPartner(r.partner) && !stornoSeller[i] ? <span className="text-xs text-muted-foreground">{personName(people.find((p) => p.id === byPartner(r.partner)))}</span> : null}
                              </TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                    {stornoErr ? <Alert tone="danger">{stornoErr}</Alert> : null}
                    <div className="flex flex-wrap gap-2">
                      <Button size="lg" variant="danger" onClick={submitStornos} disabled={stornoPending || stornoRows.some((r, i) => !stornoUser(i, r))}>
                        {stornoPending ? <Loader2 className="animate-spin" /> : <Undo2 />}{stornoRows.length} Stornos buchen
                      </Button>
                      <Button variant="ghost" onClick={() => setStornoRows([])}>Verwerfen</Button>
                    </div>
                    {stornoRows.some((r, i) => !stornoUser(i, r)) ? <Badge variant="warning">Bitte jeder Zeile einen Mitarbeiter zuordnen</Badge> : null}
                  </div>
                ) : null}
              </>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
