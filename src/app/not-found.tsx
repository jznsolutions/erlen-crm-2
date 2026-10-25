import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl font-semibold text-muted-foreground/40">404</p>
      <h1 className="text-xl font-semibold">Seite nicht gefunden</h1>
      <p className="max-w-sm text-sm text-muted-foreground">Die Seite existiert nicht oder du hast keinen Zugriff darauf.</p>
      <Button asChild><Link href="/dashboard">Zum Dashboard</Link></Button>
    </div>
  );
}
