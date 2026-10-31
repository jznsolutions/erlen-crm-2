import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ring-white/5", {
  variants: {
    variant: {
      neutral: "bg-muted text-muted-foreground",
      primary: "bg-[#818cf8]/15 text-[#c7cfff] ring-[#818cf8]/30",
      success: "bg-success-soft text-success ring-success/25",
      warning: "bg-warning-soft text-warning ring-warning/25",
      danger: "bg-danger-soft text-danger ring-danger/25",
      info: "bg-info-soft text-info ring-info/25",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
