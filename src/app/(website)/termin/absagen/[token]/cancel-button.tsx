"use client";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { cancelBookingByToken } from "./actions";

export function CancelBookingButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  if (done) return <p className="mt-6 text-emerald-300" role="status">{done}</p>;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => setDone((await cancelBookingByToken(token)).message))}
      className="btn-light mt-6 disabled:opacity-60"
    >
      {pending ? <Loader2 className="size-5 animate-spin" /> : null}
      Ja, Termin absagen
    </button>
  );
}
