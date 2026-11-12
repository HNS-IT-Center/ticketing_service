import Link from "next/link";
import { ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "akun", label: "Akun", href: "/admin/users", icon: Users },
  { key: "role", label: "Role & Izin", href: "/admin/settings/access", icon: ShieldCheck },
] as const;

/**
 * "Pengguna & Akses": the accounts and what each role may do, one page in two
 * tabs (owner, 2026-11-12). Each tab is its own route, so a link, the back
 * button and a reload land on the tab the person was on.
 */
export function UsersAccessHeader({
  active,
  description,
  actions,
}: {
  active: (typeof TABS)[number]["key"];
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Pengguna & Akses" description={description} actions={actions} />
      <nav aria-label="Pengguna & Akses" className="flex flex-wrap gap-1 self-start rounded-xl border border-border bg-card p-1">
        {TABS.map((t) => {
          const on = t.key === active;
          const Icon = t.icon;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9",
                on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
