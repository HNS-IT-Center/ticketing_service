import { Lock, Pencil, ShieldCheck, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { loadAccessOverrides } from "@/lib/access-server";
import { AUDIENCE_LABELS, CAPABILITIES, CAPABILITY_INFO, appliesTo, audienceAllowed, type Audience } from "@/lib/access";
import { AUDIENCE_HINTS, AUDIENCE_ORDER, accessGroupsFor, accessSummary } from "@/lib/access-groups";
import RoleEditDialog from "./RoleEditDialog";
import { UsersAccessHeader } from "@/components/users/UsersAccessTabs";
import { cn } from "@/lib/utils";

export const metadata = { title: "Role & Izin — HNS IT Center" };

/**
 * Pengguna & Akses → Role & Izin: one card per role with how many of its
 * settings are on and how many active accounts hold it. A card opens the
 * role's settings in a dialog (owner, 2026-11-12). Roles are fixed groups of the app, so
 * there is no adding or deleting one here.
 */
export default async function AccessSettingsPage() {
  await requireRole("Administrator");
  const [overrides, byRole, coordinators, heads] = await Promise.all([
    loadAccessOverrides(),
    db.user.groupBy({ by: ["role"], where: { is_active: true }, _count: { _all: true } }),
    db.user.count({ where: { is_active: true, role: "Technician", is_team_leader: true } }),
    db.user.count({ where: { is_active: true, role: "Technician", is_head_technician: true } }),
  ]);
  const ofRole = (role: string) => byRole.find((r) => r.role === role)?._count._all ?? 0;
  const users: Record<Audience, number> = {
    administrator: ofRole("Administrator"),
    coordinator: coordinators,
    head_technician: heads,
    technician: ofRole("Technician"),
    sales: ofRole("Sales"),
    rma: ofRole("RMA"),
    store_supervisor: ofRole("StoreSupervisor"),
    stock_admin: ofRole("StockAdmin"),
    finance: ofRole("Finance"),
  };

  return (
    <div data-slot="access-settings" className="flex flex-col gap-5">
      <UsersAccessHeader
        active="role"
        description="Role menentukan halaman dan fitur yang bisa dibuka. Seseorang mendapat akses bila salah satu role-nya diizinkan — koordinator dan Head Teknisi juga termasuk Teknisi."
      />

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {AUDIENCE_ORDER.map((a) => {
          const { allowed, total } = accessSummary(a, overrides);
          const fixed = a === "administrator";
          const body = (
            <>
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ShieldCheck className="size-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-semibold text-foreground">{AUDIENCE_LABELS[a]}</span>
                  <span className="text-xs text-muted-foreground">{AUDIENCE_HINTS[a]}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground",
                    !fixed && "group-hover:bg-muted group-hover:text-foreground",
                  )}
                >
                  {fixed ? <Lock className="size-4" /> : <Pencil className="size-4" />}
                </span>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck aria-hidden="true" className="size-3.5" /> {allowed} / {total} izin
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Users aria-hidden="true" className="size-3.5" /> {users[a]} user
                </span>
              </div>
            </>
          );
          const card = "group flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground";
          return (
            <li key={a}>
              {fixed ? (
                <div className={card} title="Admin selalu punya semua akses">
                  {body}
                </div>
              ) : (
                <RoleEditDialog
                  audience={a}
                  label={AUDIENCE_LABELS[a]}
                  hint={AUDIENCE_HINTS[a]}
                  groups={accessGroupsFor(a)}
                  allowed={CAPABILITIES.filter((c) => audienceAllowed(c, a, overrides))}
                  defaults={CAPABILITIES.filter((c) => appliesTo(c, a) && CAPABILITY_INFO[c].defaults.includes(a))}
                  className={cn(card, "outline-none transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50")}
                >
                  {body}
                </RoleEditDialog>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
