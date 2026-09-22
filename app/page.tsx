import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { dashboardPathForRoleName } from "@/lib/routes";

export default async function Home() {
  const session = await getSession();

  if (!session) redirect("/login");

  redirect(dashboardPathForRoleName(session.role));
}
