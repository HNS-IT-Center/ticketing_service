import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/PageHeader";
import EditUserForm from "./EditUserForm";

export const metadata = { title: "Edit User — HNS IT Center" };

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("Administrator");
  const { id } = await params;

  const user = await db.user.findUnique({ where: { id } });

  if (!user) notFound();

  return (
    <div data-slot="edit-user-page" className="flex w-full max-w-2xl flex-col gap-6">
      <PageHeader breadcrumb={[{ label: "Users", href: "/admin/users" }, { label: user.name }]} title="Edit User" />
      <EditUserForm user={user} />
    </div>
  );
}
