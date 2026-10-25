"use client";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Fester Bewerbungs-Button – erscheint nach dem Einstieg, verschwindet am Formular. */
export function StickyCta() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const form = document.getElementById("bewerben");
    let formVisible = false;
    const io = form ? new IntersectionObserver(([e]) => { formVisible = e.isIntersecting; update(); }, { threshold: 0.1 }) : null;
    function update() { setShow(window.scrollY > window.innerHeight * 0.7 && !formVisible); }
    if (form && io) io.observe(form);
    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => { window.removeEventListener("scroll", update); io?.disconnect(); };
  }, []);
  return (
    <div className={cn("fixed inset-x-0 bottom-0 z-40 p-4 transition-all duration-500 sm:hidden", show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0")}>
      <a href="#bewerben" className="btn-primary w-full rounded-full !h-14 !text-[0.8rem]">Jetzt in 60 Sekunden bewerben <ArrowRight className="size-4" /></a>
    </div>
  );
}
