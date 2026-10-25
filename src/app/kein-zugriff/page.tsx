import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { robots: { index: false, follow: false } };

export default function NoAccess() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <ShieldAlert className="size-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">Kein Zugriff</h1>
      <p className="max-w-sm text-sm text-muted-foreground">Für diesen Bereich fehlt dir die Berechtigung. Wende dich bei Bedarf an die Administration.</p>
      <Button asChild><Link href="/dashboard">Zum Dashboard</Link></Button>
    </div>
  );
}
