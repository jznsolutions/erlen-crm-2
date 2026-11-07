import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

// Screenshot einer Auftragsliste aus dem Partner-CRM in eine Tabelle übersetzen.
// Kundendaten (Namen, Adressen, Telefon, E-Mail) werden ausdrücklich NICHT übernommen.
const TableSchema = z.object({
  headers: z.array(z.string()).describe("Spaltenüberschriften genau wie im Bild, ohne Spalten mit Kundendaten"),
  rows: z.array(z.array(z.string())).describe("Je Auftrag eine Zeile, Werte in derselben Reihenfolge wie headers, genau wie im Bild abgeschrieben"),
});

let client: Anthropic | null = null;

export async function readTableFromScreenshot(mediaType: "image/jpeg" | "image/png" | "image/webp", base64: string): Promise<{ ok: true; headers: string[]; rows: string[][] } | { ok: false; error: string }> {
  try {
    client ??= new Anthropic();
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(TableSchema) },
      system:
        "Du schreibst Tabellen aus Screenshots eines Vertriebs-CRM exakt ab. Übernimm nur Spalten wie Auftrags-/Vertragsnummer, Verkäufer/Vertriebspartner, Produkt/Tarif, Status, Datum und Menge. Spalten mit Kundendaten (Namen von Kunden, Adressen, Telefonnummern, E-Mail-Adressen, Geburtsdaten, Bankdaten) lässt du vollständig weg. Erfinde nichts: Unleserliches bleibt ein leerer Text.",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: "Schreib die Auftragsliste aus diesem Screenshot ab." },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) return { ok: false, error: "Der Screenshot konnte nicht gelesen werden." };
    const { headers, rows } = response.parsed_output;
    if (!headers.length || !rows.length) return { ok: false, error: "Im Screenshot wurde keine Auftragsliste erkannt." };
    return { ok: true, headers, rows: rows.map((r) => headers.map((_, i) => r[i] ?? "")) };
  } catch (e) {
    if (e instanceof Anthropic.APIError) console.error("[screenshot]", e.status, e.message);
    else console.error("[screenshot]", (e as Error).message);
    return { ok: false, error: "Die KI ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen." };
  }
}
