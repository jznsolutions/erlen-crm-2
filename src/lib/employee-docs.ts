// Arten von Mitarbeiter-Unterlagen (entsprechen employee_documents.category)
export const DOC_CATEGORIES = [
  { key: "gewerbeanmeldung", label: "Gewerbeanmeldung" },
  { key: "fuehrerschein", label: "Führerschein" },
  { key: "personalausweis", label: "Personalausweis / Reisepass" },
  { key: "steuer", label: "Steuerunterlagen (Steuernummer, USt-IdNr.)" },
  { key: "bankdaten", label: "Bankdaten" },
  { key: "vertrag", label: "Vertrag / Vereinbarung" },
  { key: "nachweis", label: "Nachweis / Zertifikat" },
  { key: "sonstiges", label: "Sonstiges" },
] as const;

export type DocCategory = (typeof DOC_CATEGORIES)[number]["key"];

export const docCategoryLabel = (key: string) => DOC_CATEGORIES.find((c) => c.key === key)?.label.split(" (")[0] ?? "Unterlage";

export const DOC_MAX_BYTES = 15 * 1024 * 1024;

const BY_EXT: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" };
export const DOC_MIME_TYPES = Object.values(BY_EXT);

/** Dateityp bestimmen (iPhones liefern bei HEIC-Fotos teils keinen Typ). */
export function docMimeType(fileName: string, reported: string): string | null {
  if (DOC_MIME_TYPES.includes(reported)) return reported;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXT[ext] ?? null;
}
