import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-200 cursor-pointer active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "btn-shine bg-[image:var(--brand-gradient)] text-white shadow-[0_0_0_1px_#ffffff1f,0_10px_30px_-10px_#6d5cffaa] hover:brightness-110 hover:shadow-[0_0_0_1px_#ffffff33,0_14px_36px_-8px_#7c5cffcc]",
        secondary: "bg-white/[0.05] text-foreground border border-white/10 backdrop-blur hover:bg-white/[0.1] hover:border-[#818cf8]/60 hover:shadow-[0_8px_24px_-12px_#818cf880]",
        ghost: "text-foreground hover:bg-white/[0.06]",
        danger: "bg-gradient-to-r from-[#ff5f6d] to-[#ff7b86] text-white shadow-[0_10px_30px_-12px_#ff5f6daa] hover:brightness-110",
        success: "bg-gradient-to-r from-[#10b981] to-[#34e3a0] text-[#04130c] shadow-[0_10px_30px_-12px_#34e3a0aa] hover:brightness-110",
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
