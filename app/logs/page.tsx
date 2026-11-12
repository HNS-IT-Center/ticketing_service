import Link from "next/link";
import { requirePage } from "@/lib/page-access";
import { accessFor } from "@/lib/access-server";
import type { PageCapability } from "@/lib/access";
import { TicketLog } from "@/components/logs/TicketLog";
import { RmaLog } from "@/components/logs/RmaLog";
import { ActivityLog } from "@/components/logs/ActivityLog";
import { cn } from "@/lib/utils";

export const metadata = { title: "Log — HNS IT Center" };

const KINDS = [
  { key: "tiket", label: "Tiket", hint: "Perubahan status tiket", cap: "page_log_ticket" },
  { key: "rma", label: "RMA", hint: "Langkah case RMA", cap: "page_log_rma" },
  { key: "aktivitas", label: "Aktivitas", hint: "Siapa melakukan apa", cap: "page_log_activity" },
] as const satisfies readonly { key: string; label: string; hint: string; cap: PageCapability }[];

type Search = Record<string, string | undefined>;

/**
 * One page for every log (owner, 2026-11-11: "harusnya bisa dijadikan 1"):
 * ticket status changes, RMA case steps, and who did what. The kind is the
 * first filter; each kind keeps the filters that fit it. Which kinds someone
 * sees is set in Pengaturan Akses → Halaman & Menu.
 */
export default async function LogsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePage("page_log_ticket", "page_log_rma", "page_log_activity");
  const access = await accessFor(session.userId);
  const kinds = KINDS.filter((k) => access.can(k.cap));
  const params = await searchParams;
  const current = kinds.find((k) => k.key === params.jenis) ?? kinds[0];
  const forwarded = Promise.resolve(params);

  return (
    <div data-slot="logs" className="flex flex-col gap-4">
      {kinds.length > 1 && (
        <nav aria-label="Jenis log" className="flex flex-wrap gap-1 self-start rounded-xl border border-border bg-card p-1">
          {kinds.map((k) => {
            const active = k.key === current.key;
            return (
              <Link
                key={k.key}
                href={`/logs?jenis=${k.key}`}
                aria-current={active ? "page" : undefined}
                title={k.hint}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                Log {k.label}
              </Link>
            );
          })}
        </nav>
      )}
      {current.key === "tiket" && <TicketLog searchParams={forwarded} />}
      {current.key === "rma" && <RmaLog searchParams={forwarded} />}
      {current.key === "aktivitas" && <ActivityLog searchParams={forwarded} />}
    </div>
  );
}
