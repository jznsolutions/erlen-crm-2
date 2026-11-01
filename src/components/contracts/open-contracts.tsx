import Link from "next/link";
import { FileSignature } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/misc";

/** Hinweis auf Verträge, die noch unterschrieben werden müssen (für die angemeldete Person). */
export async function OpenContracts({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("contract_requests").select("id, contract_templates(title)").eq("user_id", userId).eq("status", "offen").order("requested_at");
  if (error || !data?.length) return null;
  return (
    <Alert tone="warning" title={data.length === 1 ? "Ein Vertrag wartet auf deine Unterschrift" : `${data.length} Verträge warten auf deine Unterschrift`}>
      <span className="flex flex-wrap gap-x-4 gap-y-1">
        {data.map((c) => (
          <Link key={c.id} href={`/vertrag/${c.id}`} className="inline-flex items-center gap-1.5 font-medium underline" data-testid="open-contract">
            <FileSignature className="size-4" />{c.contract_templates?.title ?? "Vertrag"} – jetzt lesen & unterschreiben
          </Link>
        ))}
      </span>
    </Alert>
  );
}
