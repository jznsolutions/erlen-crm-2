import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

export function Avatar({ first, last, src, className }: { first: string; last: string; src?: string | null; className?: string }) {
  return (
    <span className={cn("inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#4f8bff] via-[#7c5cff] to-[#a855f7] text-xs font-bold text-white ring-2 ring-white/10 shadow-[0_6px_18px_-6px_#7c5cff]", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- kurzlebige signierte URL
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        initials(first, last)
      )}
    </span>
  );
}
