import { requireUser } from "@/lib/auth";
export default async function Dashboard() {
  const user = await requireUser();
  return <h1 className="text-2xl font-semibold">Hallo {user.firstName}</h1>;
}
