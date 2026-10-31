"use client";
import { useState, useTransition } from "react";
import { BellRing, BellOff } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/input";
import { setGongMuted } from "@/app/(portal)/benachrichtigungen/actions";

export function GongToggle({ muted }: { muted: boolean }) {
  const [value, setValue] = useState(muted);
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
      {value ? <BellOff className="size-4 text-muted-foreground" /> : <BellRing className="size-4 text-warning" />}
      <span className="flex-1">
        <span className="font-medium">Abschluss-Gong</span>
        <span className="block text-xs text-muted-foreground">Mitteilung, wenn jemand aus deinem Team (bzw. der Agentur) einen Abschluss macht.</span>
      </span>
      <Checkbox
        checked={!value}
        disabled={pending}
        aria-label="Abschluss-Gong erhalten"
        onChange={(e) => {
          const next = !e.target.checked;
          setValue(next);
          start(async () => {
            const r = await setGongMuted(next);
            if (r.ok) toast.success(r.message ?? "Gespeichert");
            else {
              toast.error(r.error);
              setValue(!next);
            }
          });
        }}
      />
    </label>
  );
}
