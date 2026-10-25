import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ProfileView } from "@/components/profile/profile-view";

export const metadata: Metadata = { title: "Mitarbeiterprofil" };

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await requireUser();
  if (id === user.id) redirect("/profil");
  const view = await ProfileView({ userId: id, viewer: user, isSelf: false });
  if (!view) notFound(); // keine Berechtigung (RLS) -> wie nicht vorhanden
  return view;
}
