"use client";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">Etwas ist schiefgelaufen</h1>
      <p className="max-w-sm text-sm text-muted-foreground">Die Seite konnte nicht geladen werden. Bitte versuche es erneut. Bleibt der Fehler bestehen, wende dich an die Administration.</p>
      <Button onClick={reset}>Erneut versuchen</Button>
    </div>
  );
}
