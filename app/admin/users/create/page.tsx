import { requireRole } from "@/lib/session";
import { PageHeader } from "@/components/app/PageHeader";
import CreateUserForm from "./CreateUserForm";

export const metadata = { title: "Add User — HNS IT Center" };

export default async function CreateUserPage() {
  await requireRole("Administrator");
  return (
    <div data-slot="create-user-page" className="flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Users", href: "/admin/users" }, { label: "Add New User" }]}
        title="Add New User"
      />
      <CreateUserForm />
    </div>
  );
}
