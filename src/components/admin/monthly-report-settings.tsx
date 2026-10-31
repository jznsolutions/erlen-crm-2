"use client";
import { useTransition } from "react";
import { FileText, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import { saveMonthlyReportSettings, sendMonthlyReportToMe } from "@/app/(portal)/admin/einstellungen/actions";

export function MonthlyReportSettings({ enabled, lastSent }: { enabled: boolean; lastSent: string | null }) {
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <ActionForm action={saveMonthlyReportSettings} className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="enabled" defaultChecked={enabled} />
          Monatsbericht automatisch am 1. jedes Monats verschicken
        </label>
        <p className="text-xs text-muted-foreground">
          Empfänger: alle aktiven Personen mit agenturweiter Berichtsansicht (Agenturleitung, Administration). Inhalt: Abschlüsse, Umsatz, Stornoquote, Produkte, Teams, Top 10, Recruiting – als PDF im Anhang.
          {lastSent ? ` Zuletzt verschickt: Bericht für ${lastSent.slice(5, 7)}/${lastSent.slice(0, 4)}.` : ""}
        </p>
        <SubmitButton variant="secondary" size="sm">Speichern</SubmitButton>
      </ActionForm>
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button asChild variant="secondary" size="sm"><a href="/api/berichte/monatsbericht" target="_blank" rel="noopener"><FileText />Vormonat als PDF ansehen</a></Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await sendMonthlyReportToMe();
              if (r.ok) toast.success(r.message ?? "Verschickt");
              else toast.error(r.error);
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Send />}Jetzt an mich schicken
        </Button>
      </div>
    </div>
  );
}
