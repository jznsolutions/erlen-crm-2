"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Freier Zeitraum (von/bis) als URL-Parameter. */
export function DateRangeFilter({ from, to, max }: { from: string; to: string; max: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  return (
    <div className="flex items-end gap-2">
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Von<Input type="date" className="h-9" value={f} max={max} onChange={(e) => setF(e.target.value)} /></label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Bis<Input type="date" className="h-9" value={t} max={max} onChange={(e) => setT(e.target.value)} /></label>
      <Button
        size="sm"
        variant="secondary"
        className="h-9"
        onClick={() => {
          const next = new URLSearchParams(params.toString());
          next.set("zeitraum", "frei");
          next.set("von", f);
          next.set("bis", t);
          next.delete("seite");
          router.replace(`${pathname}?${next.toString()}`);
        }}
      >
        Anwenden
      </Button>
    </div>
  );
}
