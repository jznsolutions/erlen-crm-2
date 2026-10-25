"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { toggleRolePermission } from "@/app/(portal)/admin/actions";

export function PermissionToggle({ role, permission, enabled, locked }: { role: string; permission: string; enabled: boolean; locked: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <input
      type="checkbox"
      className="size-4 accent-[var(--primary)] disabled:opacity-40"
      checked={enabled}
      disabled={locked || pending}
      aria-label={`${permission} für ${role}`}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("role", role);
        fd.set("permission", permission);
        fd.set("enabled", String(e.target.checked));
        start(async () => {
          const r = await toggleRolePermission(null, fd);
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
          router.refresh();
        });
      }}
    />
  );
}
