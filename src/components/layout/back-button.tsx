"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// Merkt sich, ob innerhalb des Portals schon navigiert wurde (dann ist „zurück“ sicher im Portal)
let visited = 0;

/** Kleiner Pfeil oben links: zurück zur vorherigen Seite (auf dem Dashboard ausgeblendet). */
export function BackButton() {
  const pathname = usePathname();
  const router = useRouter();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (last.current !== pathname) {
      visited++;
      last.current = pathname;
    }
  }, [pathname]);
  if (pathname === "/dashboard" || pathname === "/") return null;
  const parent = pathname.split("/").slice(0, -1).join("/") || "/dashboard";
  return (
    <button
      type="button"
      onClick={() => (visited > 1 && window.history.length > 1 ? router.back() : router.push(parent === "" ? "/dashboard" : parent))}
      aria-label="Zurück zur vorherigen Seite"
      title="Zurück"
      className="inline-flex size-10 items-center justify-center rounded-full text-foreground hover:bg-white/[0.06]"
    >
      <ArrowLeft className="size-5" />
    </button>
  );
}
