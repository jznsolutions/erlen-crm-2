// Inhalte und Kontaktdaten der öffentlichen Website an einer Stelle.
// Werte mit null werden auf der Website ausgeblendet. Bitte nur echte Angaben eintragen.
export const SITE = {
  name: "ERLEN Vertriebsagentur",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.erlen-sales.de",
  claim: "Verdiene Geld im Vertrieb. Nicht mit Zeit.",
  description:
    "ERLEN Vertriebsagentur: Starte im Vertrieb mit leistungsabhängigem Einkommen, klaren Prozessen, Training und echtem Performance-Tracking. Jetzt in 60 Sekunden bewerben.",
  // Kennzahlen von der bisherigen Website – bitte aktuell halten
  stats: [
    { value: 5000, suffix: "+", label: "Neukunden" },
    { value: 20, suffix: "+", label: "Vertriebspartner" },
    { value: 100, suffix: "+", label: "Projekte" },
  ],
  // TODO: echte Daten eintragen (null = ausgeblendet)
  whatsapp: null as string | null, // z. B. "4917612345678" (internationale Schreibweise ohne +)
  calendlyUrl: null as string | null, // z. B. "https://calendly.com/erlen/kennenlernen"
  email: null as string | null, // z. B. "karriere@erlen-sales.de"
  phone: null as string | null,
  instagram: null as string | null,
  linkedin: null as string | null,
};
