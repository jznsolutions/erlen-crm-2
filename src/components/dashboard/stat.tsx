import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { CountUp } from "@/components/count-up";

export type Accent = "blue" | "violet" | "cyan" | "pink" | "emerald" | "amber";

const ACCENTS: Record<Accent, { chip: string; line: string; glow: string }> = {
  blue: { chip: "from-[#4f8bff] to-[#3b5bdb]", line: "from-[#4f8bff]", glow: "#4f8bff" },
  violet: { chip: "from-[#a855f7] to-[#6d28d9]", line: "from-[#a855f7]", glow: "#a855f7" },
  cyan: { chip: "from-[#22d3ee] to-[#0e7490]", line: "from-[#22d3ee]", glow: "#22d3ee" },
  pink: { chip: "from-[#ec4899] to-[#9d174d]", line: "from-[#ec4899]", glow: "#ec4899" },
  emerald: { chip: "from-[#34e3a0] to-[#047857]", line: "from-[#34e3a0]", glow: "#34e3a0" },
  amber: { chip: "from-[#fbc94a] to-[#b45309]", line: "from-[#fbc94a]", glow: "#fbc94a" },
};

export function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  accent = "blue",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "success" | "warning";
  accent?: Accent;
  className?: string;
}) {
  const a = ACCENTS[accent];
  return (
    <Card className={cn("group overflow-hidden p-4 sm:p-5", className)}>
      {/* Farbiger Lichtschein und Akzentlinie */}
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full opacity-25 blur-2xl transition-opacity duration-500 group-hover:opacity-50" style={{ background: a.glow }} />
      <span aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent", a.line)} />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        {Icon ? (
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg ring-1 ring-white/20 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6", a.chip)} style={{ boxShadow: `0 8px 24px -8px ${a.glow}` }}>
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <p className={cn("relative mt-1 font-display text-3xl font-extrabold tracking-tight tabular sm:text-4xl", tone === "success" && "text-success", tone === "warning" && "text-warning")}>
        {typeof value === "string" ? <CountUp text={value} /> : value}
      </p>
      {sub ? <p className="relative mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </Card>
  );
}
