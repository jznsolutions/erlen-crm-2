import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Alert, EmptyState, PageHeader } from "@/components/ui/misc";
import { ApplicantBoard, type BoardApplicant } from "@/components/applicants/board";

export const metadata: Metadata = { title: "Bewerber" };

export default async function ApplicantsPage() {
  const user = await requirePermission("applicants.read");
  const supabase = await createClient();
  const [{ data }, { data: bookings }] = await Promise.all([
    supabase.from("applicants").select("id, full_name, email, phone, message, source, status, notes, created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("bookings").select("applicant_id, starts_at").eq("status", "gebucht").gte("starts_at", new Date(Date.now() - 86400000).toISOString()).not("applicant_id", "is", null).order("starts_at"),
  ]);
  const nextBooking = new Map<string, string>();
  for (const b of bookings ?? []) if (b.applicant_id && !nextBooking.has(b.applicant_id)) nextBooking.set(b.applicant_id, b.starts_at);
  const applicants: BoardApplicant[] = (data ?? []).map((a) => ({ ...a, next_booking: nextBooking.get(a.id) ?? null }));
  return (
    <div>
      <PageHeader
        title="Bewerber-Pipeline"
        description="Bewerbungen von der Website. Karte antippen für Details und Notizen; mit den Pfeilen (oder per Ziehen am Computer) in die nächste Spalte verschieben."
      />
      <Alert tone="info" className="mb-6">Bewerberdaten werden nur zur Bearbeitung der Bewerbung genutzt. Abgeschlossene Bewerbungen bitte zeitnah löschen (Löschkonzept: spätestens 6 Monate).</Alert>
      {applicants.length ? (
        <ApplicantBoard applicants={applicants} canManage={user.permissions.has("applicants.manage")} canInvite={user.permissions.has("employees.invite")} />
      ) : (
        <EmptyState icon={Inbox} title="Keine Bewerbungen" description="Neue Bewerbungen von der Website erscheinen hier automatisch." />
      )}
    </div>
  );
}
