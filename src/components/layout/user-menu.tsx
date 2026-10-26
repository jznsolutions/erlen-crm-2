"use client";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { LogOut, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { signOut } from "@/lib/auth-actions";

export function UserMenu({ first, last, role, avatarUrl }: { first: string; last: string; role: string; avatarUrl: string | null }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-2 rounded-md p-1 hover:bg-muted" aria-label="Benutzermenü">
        <Avatar first={first} last={last} src={avatarUrl} className="size-8" />
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-tight">{first} {last}</span>
          <span className="block text-xs text-muted-foreground leading-tight">{role}</span>
        </span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-48 rounded-xl border bg-popover p-1 shadow-2xl">
          <DropdownMenu.Item asChild>
            <Link href="/profil" className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-muted">
              <UserRound className="size-4" /> Mein Profil
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <form action={signOut}>
            <DropdownMenu.Item asChild>
              <button type="submit" className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-danger outline-none data-[highlighted]:bg-muted">
                <LogOut className="size-4" /> Abmelden
              </button>
            </DropdownMenu.Item>
          </form>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
