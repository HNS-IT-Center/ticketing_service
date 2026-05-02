import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function Home() {
  const session = await getSession();

  if (!session) redirect("/login");

  switch (session.role) {
    case "Administrator":
      redirect("/admin/dashboard");
    case "Technician":
      redirect("/technician/dashboard");
    default:
      redirect("/customer/dashboard");
  }
}
