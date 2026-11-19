import { PageHeader } from "@/components/app/PageHeader";
import CreateUserForm from "./CreateUserForm";
import { requirePage } from "@/lib/page-access";
import { roleOptions } from "@/lib/access-roles-server";
import { roleSelectOptions } from "@/lib/access-roles";
import { mayManageAccount } from "@/lib/admin-roles";

export const metadata = { title: "Add User — HNS IT Center" };

export default async function CreateUserPage() {
  const session = await requirePage("manage_users");
  return (
    <div data-slot="create-user-page" className="flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Users", href: "/admin/users" }, { label: "Add New User" }]}
        title="Add New User"
      />
      <CreateUserForm roles={roleSelectOptions(await roleOptions(), (base) => mayManageAccount(session.role, null, base))} />
    </div>
  );
}
