import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { Ticket, Users, Shield } from "lucide-react";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import ProfileForm from "@/components/ui/ProfileForm";
import ChangePasswordForm from "@/components/ui/ChangePasswordForm";
import { Card, CardContent } from "@/components/ui/card";
import { updateAdminProfileAction } from "@/app/actions/profile";

export const metadata = { title: "My Profile — HNS IT Center" };

export default async function AdminProfilePage() {
  const session = await requireRole("Administrator");

  const [user, totalTickets, totalUsers] = await Promise.all([
    db.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone_number: true,
        address: true,
        created_at: true,
        password: true,
      },
    }),
    db.ticket.count(),
    db.user.count({ where: { role: { not: "Administrator" } } }),
  ]);

  if (!user) return <EmptyState icon={Users} title="User not found." />;

  return (
    // Built from components/app and shadcn only, so the page opts into
    // Tailwind spacing with a data-slot (the UI-1 reset rule).
    <div data-slot="admin-profile" className="flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Shield aria-hidden="true" className="size-6" /> Admin Profile
          </span>
        }
        description="Manage your administrator account"
      />

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Tickets" value={totalTickets} icon={Ticket} />
        <StatCard label="Total Users" value={totalUsers} icon={Users} />
      </div>

      {/* Avatar + info */}
      <Card>
        <CardContent className="flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
            {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="text-lg font-bold text-foreground">{user.name}</div>
            <div className="text-sm text-muted-foreground">Administrator</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Member since {new Date(user.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editable form */}
      <ProfileForm
        userId={user.id}
        initialName={user.name}
        initialPhone={user.phone_number ?? ""}
        initialAddress={user.address ?? ""}
        updateAction={updateAdminProfileAction}
      />

      {/* Change password */}
      <ChangePasswordForm hasPassword={!!user.password} />
    </div>
  );
}
