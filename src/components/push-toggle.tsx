"use client";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { BellOff, BellRing, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { pushPublicKey, removePushSubscription, savePushSubscription, sendPushTest } from "@/app/(portal)/benachrichtigungen/actions";

type State = "laden" | "nicht-unterstuetzt" | "ios-installieren" | "blockiert" | "aus" | "an";

const toKey = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Schalter „Benachrichtigungen auf diesem Gerät“ (Web Push). */
export function PushToggle() {
  const [state, setState] = useState<State>("laden");
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setState(isIos() && !isStandalone() ? "ios-installieren" : "nicht-unterstuetzt");
      }
      if (Notification.permission === "denied") return setState("blockiert");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "an" : "aus");
    })().catch(() => setState("nicht-unterstuetzt"));
  }, []);

  const enable = () =>
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return setState(permission === "denied" ? "blockiert" : "aus");
        const res = await pushPublicKey();
        if ("error" in res) return void toast.error(res.error, { duration: 10_000 });
        const key = res.key;
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) });
        const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        const r = await savePushSubscription({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, userAgent: navigator.userAgent });
        if (!r.ok) return void toast.error(r.error);
        setState("an");
        toast.success(r.message ?? "Aktiviert");
      } catch (e) {
        console.error(e);
        toast.error("Aktivieren hat nicht geklappt. Bitte Seite neu laden und erneut versuchen.");
      }
    });

  const disable = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("aus");
      toast.success("Benachrichtigungen auf diesem Gerät ausgeschaltet.");
    });

  const test = () =>
    start(async () => {
      const r = await sendPushTest();
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });

  if (state === "laden") return null;
  if (state === "ios-installieren") {
    return (
      <Alert tone="info" title="Benachrichtigungen aufs iPhone">
        <p className="flex items-start gap-2"><Smartphone className="mt-0.5 size-4 shrink-0" />Auf dem iPhone gehen Benachrichtigungen nur, wenn das Portal auf dem Home-Bildschirm liegt: In Safari unten auf <strong>Teilen</strong> (Quadrat mit Pfeil) → <strong>„Zum Home-Bildschirm“</strong> → <strong>Hinzufügen</strong>. Danach das Portal über das neue ERLEN-Symbol öffnen und hier aktivieren.</p>
      </Alert>
    );
  }
  if (state === "nicht-unterstuetzt") {
    return <Alert tone="info">Dieser Browser unterstützt keine Push-Benachrichtigungen. Tipp: Portal in Chrome (Android) oder über den Home-Bildschirm (iPhone) öffnen.</Alert>;
  }
  if (state === "blockiert") {
    return <Alert tone="warning" title="Benachrichtigungen sind blockiert">Du hast Benachrichtigungen für diese Seite abgelehnt. Erlaube sie in den Einstellungen deines Handys bzw. Browsers (Mitteilungen → ERLEN) und lade die Seite neu.</Alert>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Benachrichtigungen auf diesem Gerät</p>
        <p className="text-xs text-muted-foreground">{state === "an" ? "Aktiv – du wirst z. B. bei neuen Gutschriften sofort benachrichtigt." : "Erhalte z. B. bei neuen Gutschriften sofort eine Mitteilung aufs Handy."}</p>
      </div>
      {state === "an" ? (
        <>
          <Button size="sm" variant="secondary" disabled={pending} onClick={test}>{pending ? <Loader2 className="animate-spin" /> : <BellRing />}Testen</Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={disable}><BellOff />Ausschalten</Button>
        </>
      ) : (
        <Button size="sm" disabled={pending} onClick={enable}>{pending ? <Loader2 className="animate-spin" /> : <BellRing />}Aktivieren</Button>
      )}
    </div>
  );
}
