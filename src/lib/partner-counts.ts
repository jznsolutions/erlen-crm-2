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

/** Verkäufername aus einer Zeile wie „LJ Leon Janzen © Team Erlen“ */
function sellerName(line: string, people: Person[]): string | null {
  const l = norm(line);
  const known = people.find((p) => l.includes(norm(`${p.first_name} ${p.last_name}`)));
  if (known) return `${known.first_name} ${known.last_name}`;
  const m = line.match(/^(.*?)\bTeam\b/);
  if (!m) return null;
  const words = m[1].split(/\s+/).filter((w) => /^\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)?$/u.test(w));
  return words.length >= 2 ? words.slice(-3).join(" ") : null;
}

/** Textzeilen eines Screenshots (von oben nach unten) → Verkäufer-Karten mit Kategorien */
export function parseCountLines(lines: string[], people: Person[]): CountCard[] {
  const cards: CountCard[] = [];
  let card: CountCard | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const name = sellerName(line, people);
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
