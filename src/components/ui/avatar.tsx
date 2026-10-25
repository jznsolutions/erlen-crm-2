import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

export function Avatar({ first, last, src, className }: { first: string; last: string; src?: string | null; className?: string }) {
  return (
    <span className={cn("inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-xs font-semibold text-accent-foreground", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- kurzlebige signierte URL
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        initials(first, last)
      )}
    </span>
  );
}
