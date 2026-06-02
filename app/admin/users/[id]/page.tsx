import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import EditUserForm from "./EditUserForm";

export const metadata = { title: "Edit User — HNS IT Center" };

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("Administrator");
  const { id } = await params;

  const user = await db.user.findUnique({ where: { id } });

  if (!user) notFound();

  return (
    <div className="mx-auto" style={{ maxWidth: "600px" }}>
      <h1 style={{ marginBottom: "1.5rem" }}>Edit User</h1>
      <EditUserForm user={user as any} />
    </div>
  );
}
