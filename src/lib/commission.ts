// Feste Provisionsstufen (entsprechen commission_levels.key)
export const LEVELS = [
  { key: "vertriebspartner", label: "Vertriebspartner" },
  { key: "ausbilder", label: "Ausbilder" },
  { key: "teamleiter", label: "Teamleiter" },
  { key: "agentur", label: "Agentur" },
] as const;

export type LevelKey = (typeof LEVELS)[number]["key"];

/** Standard-Stufe nach Rolle (wenn im Profil nichts anderes eingestellt ist). */
export function levelForRole(role: string | null | undefined): LevelKey | null {
  if (role === "vertriebspartner" || role === "ausbilder" || role === "teamleiter") return role;
  if (role === "agenturleiter") return "agentur";
  return null;
}

export const ITEM_CATEGORY_LABELS: Record<string, string> = {
  vermittlung: "Vermittlungsprovision",
  overhead_ausbilder: "Overhead Ausbilder",
  overhead_teamleiter: "Overhead Teamleiter",
  zusatz: "Zusatzposition",
  sonstiges: "Sonstiges",
};
