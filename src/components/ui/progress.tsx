import { cn } from "@/lib/utils";

/** Fortschrittsbalken. value 0..1 (Werte > 1 werden gekappt dargestellt). */
export function Progress({ value, className, tone = "primary", label }: { value: number; className?: string; tone?: "primary" | "success" | "warning"; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color =
    tone === "success"
      ? "bg-gradient-to-r from-[#10b981] to-[#34e3a0] shadow-[0_0_12px_#34e3a066]"
      : tone === "warning"
        ? "bg-gradient-to-r from-[#f59e0b] to-[#fbc94a] shadow-[0_0_12px_#fbc94a55]"
        : "bg-[image:var(--accent-gradient)] shadow-[0_0_12px_#818cf866]";
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-white/[0.06] ring-1 ring-inset ring-white/5", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
    >
      <div className={cn("animate-grow h-full rounded-full transition-[width]", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}
