"use client";
import { useTransition } from "react";
import { signOut } from "@/lib/auth-actions";

export function SignOutLink() {
  const [pending, start] = useTransition();
  return (
    <p className="mt-3 text-center text-sm">
      <button type="button" className="text-muted-foreground underline" disabled={pending} onClick={() => start(() => signOut())}>
        {pending ? "Abmelden …" : "Abmelden"}
      </button>
    </p>
  );
}
