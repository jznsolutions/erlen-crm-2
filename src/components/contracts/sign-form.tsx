"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eraser, FileSignature, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Checkbox, Field, Input } from "@/components/ui/input";
import { confetti } from "@/lib/confetti";
import { signContract } from "@/app/(portal)/vertrag/actions";

/** Unterschreiben: Name eintippen, mit Finger/Maus unterschreiben, gelesen bestätigen. */
export function SignForm({ requestId, defaultName }: { requestId: string; defaultName: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [name, setName] = useState(defaultName);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b0f1a";
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasInk(true);
  };
  const up = () => {
    drawing.current = false;
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await signContract({ requestId, signedName: name, signature: canvas.current!.toDataURL("image/png"), accepted: accepted as true });
      if (r.ok) {
        confetti();
        toast.success(r.message ?? "Unterschrieben");
        router.push("/unterlagen");
      } else setError(r.error);
    });

  return (
    <div className="space-y-4">
      <Field label="Vollständiger Name" htmlFor="sign-name">
        <Input id="sign-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />
      </Field>
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium">Unterschrift</span>
          <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!hasInk}><Eraser />Löschen</Button>
        </div>
        <canvas
          ref={canvas}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          className="h-44 w-full touch-none rounded-2xl border-2 border-dashed border-white/20 bg-white"
          aria-label="Unterschriftsfeld – mit Finger oder Maus unterschreiben"
          data-testid="signature-pad"
        />
        <p className="mt-1 text-xs text-muted-foreground">Mit Finger, Stift oder Maus im weißen Feld unterschreiben.</p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5" />
        <span>Ich habe den Vertrag vollständig gelesen und stimme ihm zu. Mir ist bewusst, dass meine Unterschrift hier rechtsverbindlich gemeint ist.</span>
      </label>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button size="lg" onClick={submit} disabled={pending || !hasInk || !accepted || name.trim().length < 3}>
        {pending ? <Loader2 className="animate-spin" /> : <FileSignature />}Verbindlich unterschreiben
      </Button>
    </div>
  );
}
