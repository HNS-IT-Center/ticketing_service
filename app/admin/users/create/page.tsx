import { requireRole } from "@/lib/session";
import CreateUserForm from "./CreateUserForm";

export const metadata = { title: "Add User — HNS IT Center" };

export default async function CreateUserPage() {
  await requireRole("Administrator");
  return (
    <div style={{ maxWidth: "600px" }}>
      <h1 style={{ marginBottom: "1.5rem" }}>Add New User</h1>
      <CreateUserForm />
    </div>
  );
}
