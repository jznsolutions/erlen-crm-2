"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Area } from "@/lib/area-shared";
import { chooseArea } from "@/components/areas/actions";

/** Umschalter zwischen den Bereichen (z. B. Glasfaser | Leads). Alle Zahlen der Seite gelten nur für den gewählten Bereich. */
export function AreaSwitch({ areas, current, className }: { areas: Area[]; current: Area | null; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (areas.length < 2 || !current) return current ? <span className={cn("inline-flex rounded-full border border-white/10 px-4 py-1.5 text-sm font-medium", className)}>{current.name}</span> : null;
  return (
    <div role="radiogroup" aria-label="Bereich" className={cn("inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1", className)}>
      {areas.map((a) => (
        <button
          key={a.id}
          type="button"
          role="radio"
          aria-checked={a.id === current.id}
          disabled={pending}
          onClick={() =>
            start(async () => {
              await chooseArea(a.key);
              router.refresh();
            })
          }
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition",
            a.id === current.id ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
          )}
        >
          {a.name}
        </button>
      ))}
      {pending ? <Loader2 className="mx-1 size-4 animate-spin text-muted-foreground" /> : null}
    </div>
  );
}
