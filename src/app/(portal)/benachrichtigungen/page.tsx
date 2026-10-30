import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatRelative } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ActionForm, SubmitButton } from "@/components/forms";
import { markAllRead } from "./actions";
import { cn } from "@/lib/utils";
import { PushToggle } from "@/components/push-toggle";

export const metadata: Metadata = { title: "Benachrichtigungen" };

export default async function NotificationsPage() {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
  const unread = (data ?? []).filter((n) => !n.read_at).length;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Benachrichtigungen" description={unread ? `${unread} ungelesen` : "Alles gelesen"} actions={unread ? <ActionForm action={markAllRead}><SubmitButton variant="secondary" size="sm">Alle als gelesen markieren</SubmitButton></ActionForm> : undefined} />
      <div className="mb-4"><PushToggle /></div>
      <Card>
        {!data?.length ? <EmptyState icon={Bell} title="Keine Benachrichtigungen" className="m-5" /> : (
          <ul className="divide-y">
            {data.map((n) => {
              const inner = (
                <div className={cn("flex gap-3 px-5 py-4", !n.read_at && "bg-accent/40")}>
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-info")} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body ? <p className="text-sm text-muted-foreground">{n.body}</p> : null}
                    <p className="mt-1 text-xs text-muted-foreground">{formatRelative(n.created_at)}</p>
                  </div>
                </div>
              );
              // Über den eigenen Pfad öffnen: markiert als gelesen und leitet weiter (kein Vorladen durch den Browser)
              return <li key={n.id}><a href={`/benachrichtigungen/${n.id}`} className="block hover:bg-muted/40">{inner}</a></li>;
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
