"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { MONEY_COOKIE } from "@/lib/ui-prefs";

/** Blendet alle Geldbeträge im Portal ein oder aus (Einstellung bleibt im Browser gespeichert). */
export function MoneyToggle({ initialHidden }: { initialHidden: boolean }) {
  const [hidden, setHidden] = useState(initialHidden);
  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    document.getElementById("portal-root")?.setAttribute("data-money", next ? "hidden" : "visible");
    document.cookie = `${MONEY_COOKIE}=${next ? "aus" : "an"}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      title={hidden ? "Beträge anzeigen" : "Beträge verbergen"}
      aria-label={hidden ? "Geldbeträge anzeigen" : "Geldbeträge verbergen"}
      className="inline-flex size-10 items-center justify-center rounded-full text-foreground hover:bg-white/[0.06]"
    >
      {hidden ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
    </button>
  );
}
