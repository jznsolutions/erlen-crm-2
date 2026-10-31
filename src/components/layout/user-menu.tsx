"use client";
import Link from "next/link";
import { useTransition } from "react";
import { DropdownMenu } from "radix-ui";
import { Loader2, LogOut, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { signOut } from "@/lib/auth-actions";

export function UserMenu({ first, last, role, avatarUrl }: { first: string; last: string; role: string; avatarUrl: string | null }) {
  const [pending, start] = useTransition();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-2 rounded-full py-1 pl-1 pr-1 transition-colors hover:bg-white/[0.06] sm:pr-3" aria-label="Benutzermenü">
        <Avatar first={first} last={last} src={avatarUrl} className="size-8" />
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-tight">{first} {last}</span>
          <span className="block text-xs text-muted-foreground leading-tight">{role}</span>
        </span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-48 rounded-xl border border-white/10 bg-popover/95 p-1 shadow-2xl backdrop-blur-xl">
          <DropdownMenu.Item asChild>
            <Link href="/profil" className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-muted">
              <UserRound className="size-4" /> Mein Profil
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          {/* Abmelden direkt beim Auswählen auslösen: ein Formular im Menü würde beim Schließen entfernt, bevor es abgeschickt wird */}
          <DropdownMenu.Item
            disabled={pending}
            onSelect={(e) => {
              e.preventDefault();
              start(() => signOut());
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-danger outline-none data-[highlighted]:bg-muted data-[disabled]:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />} {pending ? "Wird abgemeldet …" : "Abmelden"}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
