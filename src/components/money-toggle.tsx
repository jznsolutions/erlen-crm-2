"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Geldbeträge sind standardmäßig verborgen. Ein Tipp auf das Auge zeigt sie an – nur bis die Seite
 * neu geladen oder das Portal neu geöffnet wird, danach sind sie wieder verborgen.
 */
export function MoneyToggle() {
  const [hidden, setHidden] = useState(true);
  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    document.getElementById("portal-root")?.setAttribute("data-money", next ? "hidden" : "visible");
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={!hidden}
      title={hidden ? "Beträge anzeigen" : "Beträge verbergen"}
      aria-label={hidden ? "Geldbeträge anzeigen" : "Geldbeträge verbergen"}
      className="inline-flex size-10 items-center justify-center rounded-full text-foreground hover:bg-white/[0.06]"
    >
      {hidden ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
    </button>
  );
}
