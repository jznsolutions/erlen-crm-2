// Abzeichen: Anzeige-Infos (vergeben werden sie in der Datenbank, siehe badge_watch)
export type BadgeInfo = { label: string; emoji: string; hint: string; tone: "gold" | "violet" | "cyan" | "emerald" | "pink" };

export const BADGES: Record<string, BadgeInfo> = {
  erster_abschluss: { label: "Erster Abschluss", emoji: "🎯", hint: "Ersten Abschluss bestätigt bekommen", tone: "cyan" },
  abschluesse_10: { label: "10 Abschlüsse", emoji: "🔟", hint: "10 bestätigte Abschlüsse insgesamt", tone: "cyan" },
  abschluesse_50: { label: "50 Abschlüsse", emoji: "🚀", hint: "50 bestätigte Abschlüsse insgesamt", tone: "violet" },
  abschluesse_100: { label: "100 Abschlüsse", emoji: "💯", hint: "100 bestätigte Abschlüsse insgesamt", tone: "violet" },
  abschluesse_500: { label: "500 Abschlüsse", emoji: "👑", hint: "500 bestätigte Abschlüsse insgesamt", tone: "gold" },
  serie_3: { label: "3 Tage in Folge", emoji: "🔥", hint: "3 Tage am Stück mit Abschluss (sonntags Pause)", tone: "pink" },
  serie_5: { label: "5 Tage in Folge", emoji: "🔥", hint: "5 Tage am Stück mit Abschluss", tone: "pink" },
  serie_10: { label: "10 Tage in Folge", emoji: "☄️", hint: "10 Tage am Stück mit Abschluss", tone: "gold" },
  erster_werber: { label: "Erster Werber", emoji: "🤝", hint: "Ersten Partner ins Team gebracht", tone: "emerald" },
  werber_5: { label: "5 Partner geworben", emoji: "🌱", hint: "5 Partner ins Team gebracht", tone: "emerald" },
  trainer_profi: { label: "Trainer-Profi", emoji: "🎓", hint: "80+ Punkte im KI-Verkaufstrainer", tone: "violet" },
  allrounder: { label: "Allrounder", emoji: "🧩", hint: "Jedes Produkt mindestens einmal verkauft", tone: "cyan" },
};

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/** Infos zu einem gespeicherten Abzeichen (auch Monatsauszeichnungen wie „monatssieger:2026-10“). */
export function badgeInfo(key: string): BadgeInfo {
  const [base, month] = key.split(":");
  const m = month ? ` ${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}` : "";
  if (base === "monatssieger") return { label: `Monatssieger${m}`, emoji: "🏆", hint: "Meiste bestätigte Abschlüsse im Monat", tone: "gold" };
  if (base === "top_werber") return { label: `Top-Werber${m}`, emoji: "🤝", hint: "Meiste neue Partner im Monat geworben", tone: "gold" };
  return BADGES[key] ?? { label: key, emoji: "🏅", hint: "", tone: "violet" };
}

export const TONE_CLASS: Record<BadgeInfo["tone"], string> = {
  gold: "from-[#fde68a]/30 to-[#d97706]/20 ring-[#fbc94a]/40",
  violet: "from-[#a855f7]/30 to-[#6d28d9]/15 ring-[#a855f7]/40",
  cyan: "from-[#22d3ee]/25 to-[#0e7490]/15 ring-[#22d3ee]/40",
  emerald: "from-[#34e3a0]/25 to-[#047857]/15 ring-[#34e3a0]/40",
  pink: "from-[#ec4899]/25 to-[#9d174d]/15 ring-[#ec4899]/40",
};
