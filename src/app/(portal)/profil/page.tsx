import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { ProfileView } from "@/components/profile/profile-view";

export const metadata: Metadata = { title: "Mein Profil" };

export default async function OwnProfilePage() {
  const user = await requireUser();
  return ProfileView({ userId: user.id, viewer: user, isSelf: true });
}
