// Schnelleingabe per Sprache oder Text: „Zwei Glasfaser, Vorgang 12345, gestern“ → Formularwerte
export type ParsedEntry = { productId?: string; quantity?: number; ref?: string; daysAgo?: number; note?: string };

const NUMBERS: Record<string, number> = {
  ein: 1, eine: 1, einen: 1, eins: 1, einer: 1,
  zwei: 2, zwo: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, zwoelf: 12,
};

const norm = (s: string) => s.toLowerCase().normalize("NFKC").replace(/[.,;!?]/g, " ").replace(/\s+/g, " ").trim();

export function parseSpokenEntry(text: string, products: { id: string; name: string }[]): ParsedEntry {
  const t = norm(text);
  const out: ParsedEntry = {};

  // Produkt: längster Name zuerst (z. B. „PV-Leads“ vor „PV“); Bindestriche/Leerzeichen egal
  const flat = t.replace(/[-\s]/g, "");
  const sorted = [...products].sort((a, b) => b.name.length - a.name.length);
  const hit = sorted.find((p) => flat.includes(p.name.toLowerCase().replace(/[-\s]/g, "")));
  if (hit) out.productId = hit.id;

  // Vorgangs-ID: nach „Vorgang“, „Vorgangsnummer“, „Auftrag(snummer)“, „Vertrag(snummer)“, „Nummer“, „ID“
  const refMatch = t.match(/\b(?:vorgangsnummer|vorgangs-?id|vorgang|auftragsnummer|auftrag|vertragsnummer|nummer|id)\b\s*(?:ist|lautet)?\s*([a-z0-9][a-z0-9\s/-]{1,60})/);
  let rest = t;
  if (refMatch) {
    // Nur Ziffern-/Buchstabengruppen bis zum nächsten Schlüsselwort übernehmen
    const raw = refMatch[1].split(/\s(?:gestern|vorgestern|heute|notiz|menge|stück|stueck)\b/)[0];
    const ref = raw.replace(/\s+/g, "").toUpperCase();
    if (/\d/.test(ref) && ref.length >= 3) out.ref = ref.slice(0, 120);
    rest = t.replace(refMatch[0], " ");
  }

  // Menge: erste Zahl (Ziffer oder Zahlwort) vor dem Produkt bzw. im Rest
  const qtyDigits = rest.match(/\b(\d{1,4})\s*(?:x|×|mal|stück|stueck|verträge|vertraege)?\b/);
  const qtyWord = rest.split(" ").find((w) => w in NUMBERS);
  const q = qtyDigits ? Number(qtyDigits[1]) : qtyWord ? NUMBERS[qtyWord] : undefined;
  if (q && q >= 1 && q <= 1000) out.quantity = q;

  // Datum
  if (/\bvorgestern\b/.test(t)) out.daysAgo = 2;
  else if (/\bgestern\b/.test(t)) out.daysAgo = 1;
  else if (/\bheute\b/.test(t)) out.daysAgo = 0;

  // Notiz: alles nach „Notiz“
  const note = text.match(/notiz[:\s]+(.+)$/i);
  if (note) out.note = note[1].trim().slice(0, 1000);
  return out;
}
