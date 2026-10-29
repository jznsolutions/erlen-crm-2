// Inhalte und Kontaktdaten der öffentlichen Website an einer Stelle.
// Werte mit null werden auf der Website ausgeblendet. Bitte nur echte Angaben eintragen.
export const SITE = {
  name: "ERLEN Vertriebsagentur",
  legalName: "Erlen-Sales GbR",
  vatId: "DE463642747",
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
  // Kontaktdaten (wie im Impressum). null = ausgeblendet
  whatsapp: null as string | null, // z. B. "4917612345678" (internationale Schreibweise ohne +)
  email: "kontakt@erlen-sales.de" as string | null,
  phone: "+49 151 44204593" as string | null,
  address: "Kömbchesweg 26, 57612 Helmenzen" as string | null,
  instagram: null as string | null,
  linkedin: null as string | null,

  // Karrierestufen (entsprechen den Rollen im Portal). income = optionaler Text, z. B. "ab 3.000 €" –
  // nur echte, belastbare Angaben eintragen. Ohne Angabe wird keine Zahl angezeigt.
  careerLevels: [
    { title: "Vertriebspartner", text: "Du startest mit Training, Leitfäden und einem festen Ausbilder an deiner Seite.", income: null as string | null },
    { title: "Ausbilder", text: "Du gibst dein Wissen weiter und begleitest neue Partner bei ihren ersten Erfolgen.", income: null as string | null },
    { title: "Teamleiter", text: "Du führst ein eigenes Team, setzt Ziele und entwickelst Menschen weiter.", income: null as string | null },
    { title: "Agenturleitung", text: "Du verantwortest Struktur, Wachstum und Ergebnisse auf Agenturebene.", income: null as string | null },
  ],

  // Erfolgsgeschichten – NUR echte Geschichten mit Einverständnis der Person eintragen.
  // Beispiel: { name: "Max", duration: "in 12 Monaten", before: "Einzelhandel", after: "Teamleiter", quote: "…" }
  testimonials: [] as { name: string; duration: string; before: string; after: string; quote: string }[],

  // Partner/Auftraggeber – nur mit Erlaubnis zur Logo-/Namensnennung eintragen (Name als Text).
  partners: [] as string[],
};
