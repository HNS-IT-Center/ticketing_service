import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/PageHeader";
import EditUserForm from "./EditUserForm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";
import { mayManageAccount, OWNER_ONLY_ACCOUNT_MESSAGE } from "@/lib/admin-roles";

export const metadata = { title: "Edit User — HNS IT Center" };

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("Administrator");
  const { id } = await params;

  const user = await db.user.findUnique({ where: { id } });

  if (!user) notFound();

  return (
    <div data-slot="edit-user-page" className="flex w-full max-w-2xl flex-col gap-6">
      <PageHeader breadcrumb={[{ label: "Users", href: "/admin/users" }, { label: user.name }]} title="Edit User" />
      {mayManageAccount(session.role, user.role, null) ? (
        <EditUserForm user={user} viewerRole={session.role} />
      ) : (
        <Alert>
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>Akun {user.role === "Owner" ? "Owner" : "Admin"}</AlertTitle>
          <AlertDescription>{OWNER_ONLY_ACCOUNT_MESSAGE}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
