"use server";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";
import { fromDbError, type ActionResult } from "@/lib/actions";
import { parseSignature, signContractPdf } from "@/lib/contract-pdf";

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

export async function signContract(input: { requestId: string; signedName: string; signature: string; accepted: boolean }): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z
    .object({ requestId: z.string().uuid(), signedName: z.string().trim().min(3).max(120), signature: z.string().max(600_000), accepted: z.literal(true) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bitte Namen eintragen, unterschreiben und bestätigen, dass du den Vertrag gelesen hast." };
  const d = parsed.data;
  // Der eingetippte Name muss zum Konto passen (Nachname enthalten)
  if (!norm(d.signedName).includes(norm(user.lastName))) {
    return { ok: false, error: `Bitte gib deinen vollständigen Namen ein (wie im Konto: ${user.firstName} ${user.lastName}).` };
  }
  const png = parseSignature(d.signature);
  if (!png) return { ok: false, error: "Die Unterschrift fehlt oder ist zu klein. Bitte im Feld unterschreiben." };

  const supabase = await createClient();
  const { data: req } = await supabase
    .from("contract_requests")
    .select("id, user_id, status, contract_templates(title, storage_path)")
    .eq("id", d.requestId)
    .maybeSingle();
  if (!req || req.user_id !== user.id || !req.contract_templates) return { ok: false, error: "Vertrag nicht gefunden." };
  if (req.status !== "offen") return { ok: false, error: "Dieser Vertrag ist nicht mehr offen." };

  const admin = createAdminClient();
  const { data: file, error: dlError } = await admin.storage.from("contracts").download(req.contract_templates.storage_path);
  if (dlError || !file) return { ok: false, error: "Die Vertragsvorlage konnte nicht geladen werden." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unbekannt";
  const ipHash = createHash("sha256").update(ip + serverEnv().RATE_LIMIT_SALT).digest("hex").slice(0, 16);
  let signed: Awaited<ReturnType<typeof signContractPdf>>;
  try {
    signed = await signContractPdf(new Uint8Array(await file.arrayBuffer()), {
      title: req.contract_templates.title,
      signedName: d.signedName,
      signerEmail: user.email,
      signaturePng: png,
      signedAt: new Date(),
      requestId: req.id,
      ipHash,
    });
  } catch (e) {
    console.error("[vertrag] pdf", (e as Error).message);
    return { ok: false, error: "Das PDF konnte nicht erstellt werden. Ist die Vorlage ein gültiges PDF?" };
  }
  const path = `${user.id}/vertrag-${Date.now()}.pdf`;
  const { error: upError } = await admin.storage.from("employee-docs").upload(path, signed.pdf, { contentType: "application/pdf", upsert: false });
  if (upError) return { ok: false, error: "Speichern fehlgeschlagen. Bitte erneut versuchen." };
  const { error } = await supabase.rpc("contract_sign_complete", {
    p_request: req.id,
    p_signed_name: d.signedName,
    p_document_path: path,
    p_document_hash: signed.signedHash,
    p_size: signed.pdf.length,
  });
  if (error) {
    await admin.storage.from("employee-docs").remove([path]);
    return fromDbError(error);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Vertrag unterschrieben – du findest ihn unter „Meine Unterlagen“." };
}
