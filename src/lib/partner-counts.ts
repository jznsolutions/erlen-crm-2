// Partner-Übersicht je Verkäufer (Screenshot) lesen: Name und qualifizierte Leads je
// Modul-Kategorie, z. B. „15-39 Module · 50 %“ und darunter „2 / 2“.
// Reine Logik – die Texterkennung liefert nur die Textzeilen.
import { guessSeller, type Person } from "@/lib/partner-sync";

export type CountCategory = { label: string; qualified: number | null; total: number | null };
export type CountCard = { name: string; categories: CountCategory[] };

const CAT = /([<>≤≥]=?\s*\d{1,3}|\d{1,3}\s*[-–]\s*\d{1,3}|\d{1,3}\s*\+)\s*Modul(?:e|en)?\b/i;
const FRACTION = /(\d{1,5})\s*[/|]\s*(\d{1,5})/;

/** „15 – 39“ → „15-39“, „> 39“ → „>39“ */
export const normCategory = (s: string) => s.replace(/\s+/g, "").replace(/–/g, "-").replace(/≥/g, ">=").replace(/≤/g, "<=");

const norm = (s: string) => s.toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();

const nameWords = (text: string) => text.split(/\s+/).filter((w) => /^\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)?$/u.test(w));

/**
 * Verkäufername aus einer Zeile wie „LJ Leon Janzen © Team Erlen“. Steht „Team …“ allein
 * in einer Zeile (Texterkennung trennt manchmal), ist der Name in der Zeile darüber.
 */
function sellerName(line: string, people: Person[], prev = ""): string | null {
  const l = norm(line);
  const known = people.find((p) => l.includes(norm(`${p.first_name} ${p.last_name}`)));
  if (known) return `${known.first_name} ${known.last_name}`;
  const m = line.match(/^(.*?)\bTeam\b/);
  if (!m) return null;
  let words = nameWords(m[1]);
  if (words.length < 2 && !m[1].trim()) words = nameWords(prev);
  return words.length >= 2 && words.length <= 4 ? words.slice(-3).join(" ") : null;
}

/** Textzeilen eines Screenshots (von oben nach unten) → Verkäufer-Karten mit Kategorien */
export function parseCountLines(lines: string[], people: Person[]): CountCard[] {
  const cards: CountCard[] = [];
  let card: CountCard | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const name = sellerName(line, people, lines[i - 1]);
    if (name) {
      card = { name, categories: [] };
      cards.push(card);
      continue;
    }
    const c = line.match(CAT);
    if (!c) continue;
    if (!card) {
      card = { name: "", categories: [] };
      cards.push(card);
    }
    const label = normCategory(c[1]);
    // Zahlen „2 / 2“ stehen in derselben oder einer der nächsten beiden Zeilen
    let qualified: number | null = null;
    let total: number | null = null;
    const after = [line.slice((c.index ?? 0) + c[0].length), ...lines.slice(i + 1, i + 3).filter((x) => !CAT.test(x))];
    for (const x of after) {
      const f = x.match(FRACTION);
      if (f) {
        qualified = Number(f[1]);
        total = Number(f[2]);
        break;
      }
      const n = x.replace(/\d{1,3}\s*%/g, "").match(/^\D*(\d{1,5})\D*$/);
      if (n && x !== after[0]) {
        qualified = Number(n[1]);
        break;
      }
    }
    card.categories = [...card.categories.filter((k) => k.label !== label), { label, qualified, total }];
  }
  return cards.filter((k) => k.categories.length);
}

/** Verkäufer einer Karte vorschlagen */
export const guessCardSeller = (name: string, people: Person[]) => (name ? guessSeller(name, people) : null);

/**
 * Zahlenbereich aus einer Modul-Angabe: „<15“, „bis 14 Module“ → [0, 14]; „15-39“ → [15, 39];
 * „>39“, „ab 40 Module“, „40+“ → [40, ∞]. Unbekannt → null.
 */
export function moduleRange(text: string): [number, number] | null {
  const t = text.toLowerCase().replace(/\s+/g, " ").replace(/–/g, "-");
  let m = t.match(/(\d{1,3})\s*(?:-|bis)\s*(\d{1,3})/);
  if (m) return [Number(m[1]), Number(m[2])];
  if ((m = t.match(/(?:<=|≤|bis(?: zu)?|max\.?|maximal|höchstens)\s*(\d{1,3})/))) return [0, Number(m[1])];
  if ((m = t.match(/<\s*(\d{1,3})/))) return [0, Number(m[1]) - 1];
  if ((m = t.match(/(?:>=|≥|ab|mind\.?|mindestens)\s*(\d{1,3})/))) return [Number(m[1]), Infinity];
  if ((m = t.match(/>\s*(\d{1,3})/))) return [Number(m[1]) + 1, Infinity];
  if ((m = t.match(/(\d{1,3})\s*\+/))) return [Number(m[1]), Infinity];
  return null;
}

export type VariantOption = { value: string; label: string; productId: string; variantId: string | null; name: string };

/** Passende Provisionsstufe für eine Partner-Kategorie (größte Überschneidung der Modul-Bereiche). */
export function matchVariant(category: string, options: VariantOption[]): string | null {
  const r = moduleRange(category);
  if (!r) return null;
  let best: string | null = null;
  let bestScore = 0;
  for (const o of options) {
    if (!o.variantId) continue;
    const v = moduleRange(o.name);
    if (!v) continue;
    const overlap = Math.min(r[1], v[1], 1000) - Math.max(r[0], v[0]) + 1;
    const exact = r[0] === v[0] && r[1] === v[1] ? 0.5 : 0;
    if (overlap + exact > bestScore) {
      bestScore = overlap + exact;
      best = o.value;
    }
  }
  return best;
}

/** Wert einer Zuordnung „Produkt-ID:Varianten-ID“ (ältere Zuordnungen: nur Produkt-ID). */
export function splitTarget(value: string): { product_id: string; variant_id: string | null } {
  const [product_id, variant_id] = value.split(":");
  return { product_id, variant_id: variant_id || null };
}
