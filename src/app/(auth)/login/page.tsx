import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/misc";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };

const messages: Record<string, { tone: "info" | "warning"; text: string }> = {
  sitzung: { tone: "warning", text: "Bitte melde dich an. Deine Sitzung ist abgelaufen oder dein Konto ist nicht aktiv." },
  link: { tone: "warning", text: "Der Link ist ungültig oder abgelaufen." },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  if (await getCurrentUser()) redirect("/dashboard");
  const msg = params.fehler ? messages[params.fehler] : undefined;
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Willkommen zurück</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">Melde dich mit deinem ERLEN-Konto an.</p>
      {params.abgemeldet ? <Alert tone="success" className="mb-4">Du wurdest abgemeldet.</Alert> : null}
      {msg ? <Alert tone={msg.tone} className="mb-4">{msg.text}</Alert> : null}
      <LoginForm next={params.weiter} />
    </div>
  );
}
