import { cn } from "@/lib/utils";

/** Fortschrittsbalken. value 0..1 (Werte > 1 werden gekappt dargestellt). */
export function Progress({ value, className, tone = "primary", label }: { value: number; className?: string; tone?: "primary" | "success" | "warning"; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color = tone === "success" ? "bg-success" : tone === "warning" ? "bg-[#c98500]" : "bg-[var(--chart-primary)]";
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
    >
      <div className={cn("h-full rounded-full transition-[width]", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}
