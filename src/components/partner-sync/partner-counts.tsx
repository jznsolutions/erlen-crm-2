"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, ImageUp, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Input, Select } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { guessCardSeller, matchVariant, splitTarget, type VariantOption } from "@/lib/partner-counts";
import type { Person } from "@/lib/partner-sync";
import { applyPartnerCounts, type CountOutcome } from "@/app/(portal)/leistungen/partner-abgleich/actions";

type Prev = { user_id: string; category: string; qualified: number; updated_at: string };
type Card = { key: string; name: string; user_id: string; categories: { label: string; qualified: string; total: number | null }[] };
type Row = { card: Card; label: string; user_id: string; qualified: number | null; total: number | null; prev: Prev | undefined; delta: number };

export function PartnerCounts({ people, options, categoryMap, prev }: { people: Person[]; options: VariantOption[]; categoryMap: Record<string, string>; prev: Prev[] }) {
  const [cards, setCards] = useState<Card[] | null>(null);
  // Ältere Zuordnungen enthalten nur die Produkt-ID → „Produkt-ID:“
  const [catMap, setCatMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(categoryMap).map(([k, v]) => [k, v && !v.includes(":") ? `${v}:` : v]).filter(([, v]) => options.some((o) => o.value === v))),
  );
  const [startOnly, setStartOnly] = useState(false);
  const [reading, setReading] = useState<{ image: number; of: number; p: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<{ rows: Row[]; res: CountOutcome[] } | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const prevMap = useMemo(() => new Map(prev.map((p) => [`${p.user_id}|${p.category}`, p])), [prev]);

  const read = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length || reading) return;
    setError(null);
    setOutcomes(null);
    setReading({ image: 0, of: images.length, p: 0 });
    try {
      const { readCountCards } = await import("@/lib/partner-ocr-browser");
      const found = await readCountCards(images, people, (image, p) => setReading({ image, of: images.length, p }));
      if (!found.length) {
        setError("Auf den Bildern wurden keine Modul-Zahlen gefunden. Bitte die Karte des Verkäufers aufklappen, sodass „Anzahl Module“ zu sehen ist.");
        return;
      }
      const labels = new Set(found.flatMap((c) => c.categories.map((k) => k.label)));
      setCatMap((m) => {
        const next = { ...m };
        for (const l of labels) if (!next[l]) next[l] = matchVariant(l, options) ?? "";
        return next;
      });
      setCards((old) => [
        ...(old ?? []),
        ...found.map((c, i) => ({
          key: `${Date.now()}-${i}`,
          name: c.name,
          user_id: guessCardSeller(c.name, people) ?? "",
          categories: c.categories.map((k) => ({ label: k.label, qualified: k.qualified === null ? "" : String(k.qualified), total: k.total })),
        })),
      ]);
    } catch {
      setError("Die Bilder konnten nicht gelesen werden.");
    } finally {
      setReading(null);
    }
  };

  // Strg+V irgendwo auf der Seite fügt Screenshots ein
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        e.preventDefault();
        void read(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("paste", onPaste);
    };
  });

  // Je Verkäufer und Kategorie zählt der zuletzt eingelesene Stand
  const rows: Row[] = useMemo(() => {
    const byKey = new Map<string, Row>();
    for (const card of cards ?? [])
      for (const k of card.categories) {
        const q = k.qualified.trim() === "" ? null : Number(k.qualified);
        const p = card.user_id ? prevMap.get(`${card.user_id}|${k.label}`) : undefined;
        const delta = q === null || !Number.isInteger(q) ? 0 : !p && startOnly ? 0 : q - (p?.qualified ?? 0);
        byKey.set(card.user_id ? `${card.user_id}|${k.label}` : `${card.key}|${k.label}`, { card, label: k.label, user_id: card.user_id, qualified: q, total: k.total, prev: p, delta });
      }
    return [...byKey.values()];
  }, [cards, prevMap, startOnly]);
  const labels = [...new Set(rows.map((r) => r.label))].sort();
  const invalid = rows.filter((r) => !r.user_id || r.qualified === null || !Number.isInteger(r.qualified) || r.qualified < 0 || !catMap[r.label]);
  const added = rows.reduce((s, r) => s + Math.max(0, r.delta), 0);
  const cancelled = rows.reduce((s, r) => s + Math.max(0, -r.delta), 0);
  const firstTime = rows.some((r) => r.user_id && !r.prev);

  const update = (key: string, fn: (c: Card) => Card) => setCards((cs) => (cs ?? []).map((c) => (c.key === key ? fn(c) : c)));

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await applyPartnerCounts({
        category_map: catMap,
        rows: rows.map((r) => ({ user_id: r.user_id, seller_name: r.card.name, category: r.label, ...splitTarget(catMap[r.label]), qualified: r.qualified, total: r.total, start_only: startOnly })),
      });
      if (res.ok) {
        setOutcomes({ rows, res: res.outcomes });
        setCards(null);
      } else setError(res.error);
    });

  if (outcomes) {
    const sum = (f: (o: CountOutcome) => number) => outcomes.res.reduce((s, o) => s + f(o), 0);
    const errors = outcomes.res.filter((o) => o.message && o.added === 0 && o.cancelled === 0 && o.message !== "Startwert gespeichert");
    return (
      <div className="space-y-4" data-testid="counts-result">
        <Alert tone={errors.length ? "warning" : "success"} title="Übernommen">
          {sum((o) => o.added)} neue Leads · {sum((o) => o.cancelled)} storniert
        </Alert>
        <ul className="space-y-1 text-sm">
          {outcomes.res.map((o) => {
            const r = outcomes.rows[o.idx - 1];
            const person = people.find((p) => p.id === r?.user_id);
            const bad = errors.includes(o);
            return (
              <li key={o.idx} className="flex gap-2">
                {bad ? <XCircle className="mt-0.5 size-4 shrink-0 text-danger" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />}
                {person ? `${person.first_name} ${person.last_name}` : r?.card.name} · {r?.label} Module: {o.added ? `+${o.added}` : ""}{o.cancelled ? ` −${o.cancelled} storniert` : ""}{!o.added && !o.cancelled ? "keine Änderung" : ""}
                {o.message ? ` – ${o.message}` : ""}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button asChild><Link href="/leistungen">Zu den Leistungen</Link></Button>
          <Button variant="secondary" onClick={() => setOutcomes(null)}><RefreshCw />Weitere Screenshots</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div
        className="rounded-2xl border-2 border-dashed border-white/15 p-6 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void read([...e.dataTransfer.files]);
        }}
      >
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" aria-label="Screenshots auswählen" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; void read(f); }} />
        <Button size="lg" onClick={() => fileRef.current?.click()} disabled={!!reading}>
          {reading ? <Loader2 className="animate-spin" /> : <ImageUp />}
          {reading ? `Bild ${reading.image + 1} von ${reading.of} wird gelesen … ${Math.round(reading.p * 100)} %` : "Screenshots auswählen"}
        </Button>
        <p className="mt-3 text-sm text-muted-foreground">
          Einen oder mehrere Screenshots der Verkäufer-Übersicht wählen – oder hier hineinziehen bzw. mit Strg+V einfügen. Wichtig: Die Karte aufklappen, sodass „Anzahl Module“ zu sehen ist.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Kostenlos: Die Bilder werden in deinem Browser gelesen und nirgendwohin geschickt.</p>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {cards?.length ? (
        <>
          <section className="space-y-2">
            <h3 className="font-semibold">Welche Provisionsstufe ist welche Modul-Kategorie?</h3>
            <p className="text-sm text-muted-foreground">Wird automatisch erkannt, wenn die Stufen nach Modulen benannt sind (z. B. „bis 14 Module“) – sonst einmal zuordnen. Stufen anlegen unter <Link href="/admin/produkte" className="underline">Produkte</Link>, Beträge unter <Link href="/admin/provisionen" className="underline">Provisionen</Link>.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {labels.map((l) => (
                <label key={l} className="text-sm">
                  <span className="mb-1 block">{l} Module</span>
                  <Select value={catMap[l] ?? ""} onChange={(e) => setCatMap({ ...catMap, [l]: e.target.value })} aria-label={`Produkt ${l}`}>
                    <option value="">– bitte wählen –</option>
                    {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-semibold">Erkannte Verkäufer</h3>
            {cards.map((c) => (
              <div key={c.key} className="space-y-3 rounded-xl border border-white/10 p-4" data-testid="count-card">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="min-w-56 flex-1 text-sm">
                    <span className="mb-1 block text-muted-foreground">Gelesen: „{c.name || "Name nicht erkannt"}“</span>
                    <Select value={c.user_id} onChange={(e) => update(c.key, (x) => ({ ...x, user_id: e.target.value }))} aria-label={`Verkäufer ${c.name || "unbekannt"}`}>
                      <option value="">– Mitarbeiter wählen –</option>
                      {people.map((p) => <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>)}
                    </Select>
                  </label>
                  <Button variant="ghost" size="sm" onClick={() => setCards((cs) => (cs ?? []).filter((x) => x.key !== c.key))}>Entfernen</Button>
                </div>
                <div className="grid gap-2">
                  {c.categories.map((k) => {
                    const row = rows.find((r) => r.card === c && r.label === k.label);
                    return (
                      <div key={k.label} className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="w-28 font-medium">{k.label} Module</span>
                        <label className="flex items-center gap-2">
                          <span className="text-muted-foreground">qualifiziert</span>
                          <Input
                            className="w-20"
                            inputMode="numeric"
                            value={k.qualified}
                            onChange={(e) => update(c.key, (x) => ({ ...x, categories: x.categories.map((y) => (y.label === k.label ? { ...y, qualified: e.target.value.replace(/\D/g, "") } : y)) }))}
                            aria-label={`Stand ${c.name || "unbekannt"} ${k.label}`}
                          />
                          {k.total !== null ? <span className="text-muted-foreground">/ {k.total}</span> : null}
                        </label>
                        <span className="text-muted-foreground">
                          {row?.prev ? `bisher ${row.prev.qualified} (${formatDate(row.prev.updated_at.slice(0, 10))})` : c.user_id ? "erstmals" : ""}
                        </span>
                        {row && row.delta > 0 ? <Badge variant="success">+{row.delta} neu</Badge> : null}
                        {row && row.delta < 0 ? <Badge variant="danger">−{-row.delta} Storno</Badge> : null}
                        {row && row.delta === 0 && row.qualified !== null && c.user_id ? <Badge>keine Änderung</Badge> : null}
                        {k.total === null || (row?.qualified != null && row.qualified > k.total) ? <Badge variant="warning">Zahl bitte prüfen</Badge> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>

          {firstTime ? (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={startOnly} onChange={(e) => setStartOnly(e.target.checked)} className="mt-0.5" />
              <span>Bei „erstmals“: bisherigen Stand nur als Startwert merken (nichts buchen) – nur nötig, wenn diese Leads schon von Hand erfasst wurden.</span>
            </label>
          ) : null}

          {invalid.length ? <Alert tone="warning">Bitte noch ergänzen: {[...new Set(invalid.map((r) => (!r.user_id ? "Verkäufer zuordnen" : !catMap[r.label] ? `Produkt für ${r.label} Module` : "Zahl eintragen")))].join(", ")}</Alert> : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={submit} disabled={pending || !!invalid.length || !rows.length}>
              {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Übernehmen (+{added}{cancelled ? ` / −${cancelled}` : ""})
            </Button>
            <Button variant="ghost" onClick={() => setCards(null)}>Verwerfen</Button>
          </div>
          <p className="text-xs text-muted-foreground">Gebucht wird nur der Unterschied zum letzten Stand – derselbe Screenshot zweimal bucht nichts doppelt. Weniger qualifizierte Leads als zuletzt werden storniert. Neue Leads zählen mit dem heutigen Datum.</p>
        </>
      ) : null}
    </div>
  );
}
