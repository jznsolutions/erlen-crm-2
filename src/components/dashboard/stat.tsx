import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function StatTile({ label, value, sub, icon: Icon, tone, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; tone?: "default" | "success" | "warning"; className?: string }) {
  return (
    <Card className={cn("p-4 sm:p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon ? <Icon className="size-4 text-muted-foreground/70" /> : null}
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tracking-tight tabular sm:text-3xl", tone === "success" && "text-success", tone === "warning" && "text-warning")}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </Card>
  );
}
