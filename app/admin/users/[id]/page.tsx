import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import EditUserForm from "./EditUserForm";

export const metadata = { title: "Edit User — TechServe" };

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("Administrator");
  const { id } = await params;

  const [user, workload] = await Promise.all([
    db.user.findUnique({ where: { id } }),
    db.technicianWorkload.findUnique({ where: { technician_id: id } }),
  ]);

  if (!user) notFound();

  return (
    <div style={{ maxWidth: "600px" }}>
      <h1 style={{ marginBottom: "1.5rem" }}>Edit User</h1>
      <EditUserForm user={{ ...user, created_at: user.created_at.toISOString(), updated_at: user.updated_at.toISOString() }} workload={workload} />
    </div>
  );
}
