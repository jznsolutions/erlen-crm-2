import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-200 cursor-pointer active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover shadow-[0_0_0_1px_#ffffff14,0_8px_24px_-8px_#8aa4c866] hover:shadow-[0_0_0_1px_#ffffff26,0_10px_30px_-6px_#8aa4c899]",
        secondary: "bg-white/[0.04] text-foreground border border-input hover:bg-white/[0.08] hover:border-ring/50",
        ghost: "text-foreground hover:bg-white/[0.06]",
        danger: "bg-danger text-primary-foreground hover:bg-danger/90",
        success: "bg-success text-primary-foreground hover:bg-success/90",
        link: "text-info underline-offset-4 hover:underline px-0",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
