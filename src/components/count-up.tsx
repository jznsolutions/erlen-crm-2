"use client";
import { useEffect, useRef, useState } from "react";

/** Zählt eine Zahl im deutschen Format (z. B. „1.234“ oder „20,7“) beim Erscheinen hoch. */
export function CountUp({ text, duration = 900 }: { text: string; duration?: number }) {
  const match = text.match(/^(\D*?)(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d+))?(.*)$/);
  const [shown, setShown] = useState(text);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!match) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const [, pre, int, dec, post] = match;
    const target = Number(int.replace(/\./g, "") + (dec ? "." + dec : ""));
    if (!Number.isFinite(target) || target === 0) return;
    const digits = dec?.length ?? 0;
    const fmt = new Intl.NumberFormat("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(pre + fmt.format(target * eased) + post);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return <span ref={ref}>{shown}</span>;
}
