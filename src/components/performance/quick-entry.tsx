"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import { Mic, MicOff, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseSpokenEntry, type ParsedEntry } from "@/lib/voice-entry";

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
function getRecognition(): Recognition | null {
  const C = recognitionClass();
  return C ? new C() : null;
}
const noop = () => () => undefined;

/** Schnelleingabe: sprechen oder tippen („Zwei Glasfaser, Vorgang 12345, gestern“) – füllt das Formular aus. */
export function QuickEntry({ products, onParsed }: { products: { id: string; name: string }[]; onParsed: (p: ParsedEntry, text: string) => void }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  // Browser-Unterstützung (Server: nein, damit nichts flackert)
  const supported = useSyncExternalStore(noop, () => Boolean(recognitionClass()), () => false);
  const rec = useRef<Recognition | null>(null);

  const apply = (value: string) => {
    const parsed = parseSpokenEntry(value, products);
    if (!parsed.productId && !parsed.quantity && !parsed.ref) {
      toast.error("Nicht verstanden – z. B. „Zwei Glasfaser, Vorgang 12345“.");
      return;
    }
    onParsed(parsed, value);
    toast.success("Formular ausgefüllt – bitte prüfen und absenden.");
  };

  const listen = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = getRecognition();
    if (!r) return;
    r.lang = "de-DE";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const said = e.results[0]?.[0]?.transcript ?? "";
      setText(said);
      apply(said);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed") toast.error("Bitte den Zugriff aufs Mikrofon erlauben.");
      else if (e.error !== "aborted" && e.error !== "no-speech") toast.error("Spracherkennung fehlgeschlagen. Bitte erneut versuchen oder tippen.");
    };
    r.onend = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#4f8bff]/10 to-[#a855f7]/10 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Wand2 className="size-4 text-[#c084fc]" />Schnelleingabe {supported ? "– sprechen oder tippen" : "– tippen"}</p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) apply(text);
        }}
      >
        {supported ? (
          <Button type="button" variant={listening ? "danger" : "default"} size="icon" onClick={listen} aria-label={listening ? "Aufnahme beenden" : "Per Sprache erfassen"}>
            {listening ? <MicOff /> : <Mic />}
          </Button>
        ) : null}
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="„2 Glasfaser, Vorgang 123, gestern“" aria-label="Schnelleingabe" className="min-w-0 flex-1" />
        <Button type="submit" variant="secondary" className="w-full sm:w-auto">Übernehmen</Button>
      </form>
      {listening ? <p className="mt-2 text-xs text-muted-foreground">Ich höre zu … sag z. B. „Zwei Glasfaser, Vorgang 12345“.</p> : null}
    </div>
  );
}
