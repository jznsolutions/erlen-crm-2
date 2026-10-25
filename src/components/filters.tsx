"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Ein Filter als URL-Parameter (damit Ansichten teil- und verlinkbar sind). */
export function FilterSelect({
  param,
  options,
  value,
  label,
  className,
  allLabel,
}: {
  param: string;
  options: { value: string; label: string }[];
  value?: string;
  label: string;
  className?: string;
  allLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <label className={cn("flex flex-col gap-1 text-xs font-medium text-muted-foreground", className)}>
      {label}
      <Select
        value={value ?? ""}
        aria-busy={pending}
        className={cn("h-9 min-w-36 text-sm text-foreground", pending && "opacity-60")}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value) next.set(param, e.target.value);
          else next.delete(param);
          next.delete("seite");
          start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
        }}
      >
        {allLabel !== undefined ? <option value="">{allLabel}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
    </label>
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-end gap-3">{children}</div>;
}
