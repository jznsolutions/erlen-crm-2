import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

// KI-Verkaufstrainer: Rollenspiel gegen einen KI-Kunden und anschließende Bewertung.
// Der API-Schlüssel steht nur als Server-Umgebungsvariable (ANTHROPIC_API_KEY) bei Vercel.

const MODEL = "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export function trainerAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export const DIFFICULTIES = {
  leicht: "freundlich und grundsätzlich offen, bringt höchstens ein bis zwei leichte Einwände",
  mittel: "skeptisch, bringt mehrere typische Einwände und lässt sich nur mit guten Argumenten überzeugen",
  schwer: "sehr kritisch, ungeduldig und will das Gespräch schnell beenden; bringt harte Einwände und testet, ob der Verkäufer ehrlich bleibt",
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;

export const SCENARIOS = {
  glasfaser: {
    title: "Glasfaser an der Haustür",
    customer: "Hausbesitzer/in, Mitte 40, zwei Kinder, aktuell DSL-Vertrag beim bisherigen Anbieter. Im Ort wird gerade Glasfaser ausgebaut.",
    objections: "„Mein Internet reicht mir“, „Was kostet mich das?“, „Ich habe keine Zeit“, „Ich habe noch Vertragslaufzeit“, „Das mache ich lieber online“, „Wie lange dauert der Hausanschluss?“",
  },
  energie: {
    title: "Strom- und Gaswechsel",
    customer: "Mieter/in, Anfang 30, hat den Stromanbieter seit Jahren nicht gewechselt und ist misstrauisch gegenüber Haustürgeschäften.",
    objections: "„Ich bin zufrieden mit meinem Anbieter“, „Das ist doch Abzocke“, „Was ist, wenn der neue Anbieter pleitegeht?“, „Ich unterschreibe nichts an der Tür“, „Ich muss das mit meinem Partner besprechen“",
  },
  pv: {
    title: "Photovoltaik-Beratung (Lead)",
    customer: "Eigenheimbesitzer/in, Ende 50, interessiert sich vage für Solar, hat aber Sorge vor hohen Kosten und Handwerkerchaos.",
    objections: "„Rechnet sich das in meinem Alter noch?“, „Mein Dach ist zu alt“, „Ich habe schon drei Angebote bekommen“, „Ich will erst den Nachbarn fragen“, „Ist ein Beratungstermin unverbindlich?“",
  },
} as const;
export type ScenarioKey = keyof typeof SCENARIOS;

export type TrainerTurn = { role: "user" | "assistant"; content: string };

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

function roleplaySystem(scenario: ScenarioKey, difficulty: Difficulty, agency: string, products: string[]) {
  const s = SCENARIOS[scenario];
  return `Du spielst in einem Verkaufstraining der ${agency} eine Kundin bzw. einen Kunden an der Haustür. Die Person, die dir schreibt, ist ein Vertriebspartner in Ausbildung und übt das Gespräch.

Deine Rolle: ${s.customer}
Verhalten: ${DIFFICULTIES[difficulty]}.
Typische Einwände in dieser Situation (nutze sie natürlich, nicht als Liste): ${s.objections}
Produkte, die der Verkäufer anbieten kann: ${products.length ? products.join(", ") : "keine Angabe"}.

So spielst du:
- Antworte immer auf Deutsch, in der Ich-Form als Kunde, kurz und gesprochen (meist 1–3 Sätze), so wie man an der Tür wirklich redet.
- Bleib in der Rolle. Kommentiere nicht das Training und gib keine Tipps.
- Reagiere realistisch: Gute Fragen, Zuhören und ehrliche, konkrete Antworten machen dich offener; Druck, Ausweichen oder übertriebene Versprechen machen dich skeptischer.
- Erfinde keine konkreten Preise oder Vertragsdetails des Anbieters; frag stattdessen danach, wenn es passt.
- Wenn der Verkäufer dich überzeugt hat, stimm einem nächsten Schritt zu (z. B. Termin oder Abschluss). Wenn er dich verloren hat, beende das Gespräch höflich.`;
}

const FeedbackSchema = z.object({
  score: z.number().int().min(0).max(100).describe("Gesamtnote 0–100"),
  outcome: z.enum(["abschluss", "termin", "offen", "abgelehnt"]).describe("Wie das Gespräch geendet hat"),
  summary: z.string().describe("Zwei bis drei Sätze Gesamteindruck, direkt an den Verkäufer (du-Form)"),
  strengths: z.array(z.string()).describe("Was gut war, konkret mit Bezug auf das Gespräch"),
  improvements: z.array(z.string()).describe("Was besser geht, konkret und umsetzbar"),
  better_phrases: z.array(z.object({ instead_of: z.string(), try: z.string() })).describe("Bessere Formulierungen für Stellen aus dem Gespräch"),
  skills: z.object({
    opening: z.number().int().min(1).max(5),
    questions: z.number().int().min(1).max(5),
    objections: z.number().int().min(1).max(5),
    closing: z.number().int().min(1).max(5),
  }).describe("Einzelnoten 1–5: Gesprächseinstieg, Bedarfsfragen, Einwandbehandlung, Abschluss"),
});
export type TrainerFeedback = z.infer<typeof FeedbackSchema>;

const asMessages = (turns: TrainerTurn[]): Anthropic.Beta.BetaMessageParam[] => turns.map((t) => ({ role: t.role, content: t.content }));

export type TrainerReply = { ok: true; text: string; ended: boolean } | { ok: false; error: string };

/** Nächste Antwort des KI-Kunden. */
export async function customerReply(scenario: ScenarioKey, difficulty: Difficulty, turns: TrainerTurn[], agency: string, products: string[]): Promise<TrainerReply> {
  try {
    const response = await anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low" },
      // Gesprächsverlauf wird bei jeder Antwort neu gesendet – Caching spart den Großteil der Eingabekosten
      cache_control: { type: "ephemeral" },
      system: roleplaySystem(scenario, difficulty, agency, products),
      messages: asMessages(turns),
    });
    if (response.stop_reason === "refusal") return { ok: false, error: "Der Kunde möchte darauf nicht antworten. Formuliere deine Nachricht bitte anders." };
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    if (!text) return { ok: false, error: "Keine Antwort erhalten. Bitte erneut senden." };
    return { ok: true, text, ended: /auf wiedersehen|tschüss|schönen tag noch|kein interesse mehr/i.test(text) };
  } catch (e) {
    return { ok: false, error: explain(e) };
  }
}

/** Bewertung des Gesprächs durch einen Verkaufstrainer. */
export async function trainingFeedback(scenario: ScenarioKey, difficulty: Difficulty, turns: TrainerTurn[]): Promise<{ ok: true; feedback: TrainerFeedback } | { ok: false; error: string }> {
  const transcript = turns.map((t) => `${t.role === "user" ? "VERKÄUFER" : "KUNDE"}: ${t.content}`).join("\n");
  try {
    const response = await anthropic().beta.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(FeedbackSchema) },
      system:
        "Du bist ein erfahrener Vertriebstrainer im Haustürvertrieb. Du bewertest Übungsgespräche fair, konkret und motivierend auf Deutsch (du-Form). Beziehe dich auf konkrete Stellen im Gespräch. Seriöses, ehrliches Verkaufen ohne Druck und ohne falsche Versprechen wird belohnt.",
      messages: [
        {
          role: "user",
          content: `Szenario: ${SCENARIOS[scenario].title}, Schwierigkeit: ${difficulty}.\n\nGesprächsverlauf:\n${transcript}\n\nBewerte den Verkäufer.`,
        },
      ],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) return { ok: false, error: "Die Auswertung ist fehlgeschlagen. Bitte erneut versuchen." };
    return { ok: true, feedback: response.parsed_output };
  } catch (e) {
    return { ok: false, error: explain(e) };
  }
}

function explain(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Der KI-Zugang ist nicht richtig eingerichtet (API-Schlüssel prüfen).";
  if (e instanceof Anthropic.RateLimitError) return "Gerade sind zu viele Anfragen unterwegs. Bitte in einer Minute erneut versuchen.";
  if (e instanceof Anthropic.APIError) {
    console.error("[trainer]", e.status, e.message);
    return "Die KI ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen.";
  }
  console.error("[trainer]", (e as Error).message);
  return "Die KI ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen.";
}
