import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/PageHeader";
import EditUserForm from "./EditUserForm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";
import { mayManageAccount, mayPromoteToOwner, OWNER_ONLY_ACCOUNT_MESSAGE } from "@/lib/admin-roles";
import PromoteOwnerButton from "@/components/users/PromoteOwnerButton";
import { requirePage } from "@/lib/page-access";
import { roleOptions } from "@/lib/access-roles-server";
import { BASE_LABELS, isRoleBase, roleSelectOptions } from "@/lib/access-roles";

export const metadata = { title: "Edit User — HNS IT Center" };

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePage("manage_users");
  const { id } = await params;

  // Only what the form shows: the whole row would put the password hash in
  // the page sent to the browser.
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone_number: true,
      address: true,
      role: true,
      shift: true,
      work_days: true,
      is_team_leader: true,
      is_head_technician: true,
      access_role: { select: { id: true, name: true } },
    },
  });

  if (!user) notFound();
  // The account's current choice, kept as an option even when this viewer may
  // not give it, or when it predates made roles.
  const roleValue = user.access_role?.id ?? user.role;
  const current = {
    value: roleValue,
    label: user.access_role?.name ?? (isRoleBase(user.role) ? `${BASE_LABELS[user.role]} (tanpa role)` : user.role === "Pending" ? "Menunggu role" : user.role),
    base: user.role,
  };
  const roles = roleSelectOptions(await roleOptions(), (base) => mayManageAccount(session.role, null, base), current);

  return (
    <div data-slot="edit-user-page" className="flex w-full max-w-2xl flex-col gap-6">
      <PageHeader breadcrumb={[{ label: "Users", href: "/admin/users" }, { label: user.name }]} title="Edit User" />
      {mayManageAccount(session.role, user.role, null) ? (
        <EditUserForm user={{ ...user, roleValue }} roles={roles} />
      ) : (
        <div className="flex flex-col gap-4">
          <Alert>
            <ShieldAlert aria-hidden="true" />
            <AlertTitle>Akun {user.role === "Owner" ? "Owner" : "Admin"}</AlertTitle>
            <AlertDescription>{OWNER_ONLY_ACCOUNT_MESSAGE}</AlertDescription>
          </Alert>
          {mayPromoteToOwner(session.role, user.role, user.id === session.userId) && (
            <PromoteOwnerButton userId={user.id} name={user.name} />
          )}
        </div>
      )}
    </div>
  );
}
