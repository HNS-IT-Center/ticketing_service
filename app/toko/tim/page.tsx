import { Contact, Mail, MessageCircle } from "lucide-react";
import { urlSort } from "@/lib/table-sort";
import { db } from "@/lib/db";
import { pickStores, requireStoreViewer } from "@/lib/store-scope-server";
import { scheduleCell, shiftLabel, type ScheduleCell } from "@/lib/store-schedule";
import { wibDayKey } from "@/lib/store-dashboard";
import { waLink } from "@/lib/whatsapp";
import { NoStores } from "@/components/toko/Sections";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarField } from "@/components/app/FilterBar";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

export const metadata = { title: "Daftar User Toko — HNS IT Center" };

type Search = { store?: string };

const DAY_NAMES: Record<string, string> = { Mon: "Sen", Tue: "Sel", Wed: "Rab", Thu: "Kam", Fri: "Jum", Sat: "Sab", Sun: "Min" };
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TODAY_STYLE: Record<ScheduleCell["kind"], string> = {
  shift: "border-tone-green-border bg-tone-green-bg text-tone-green-fg",
  covering: "border-tone-blue-border bg-tone-blue-bg text-tone-blue-fg",
  covered: "border-tone-amber-border bg-tone-amber-bg text-tone-amber-fg",
  leave: "border-tone-red-border bg-tone-red-bg text-tone-red-fg",
  off: "border-border bg-muted text-muted-foreground",
  unset: "border-dashed border-border bg-card text-muted-foreground",
};

function todayText(c: ScheduleCell): string {
  switch (c.kind) {
    case "shift":
      return `Masuk · ${shiftLabel(c.shift)}`;
    case "covering":
      return `Gantikan ${c.for}`;
    case "covered":
      return `Digantikan ${c.by}`;
    case "leave":
      return "Cuti";
    case "off":
      return "Libur";
    case "unset":
      return "Jadwal belum diatur";
  }
}

type Row = {
  id: string;
  name: string;
  role: string;
  stores: string[];
  phone: string | null;
  email: string | null;
  shift: string | null;
  workDays: string[] | null;
  today: ScheduleCell | null;
  active: number;
};

/**
 * Who works at the kepala toko's stores, read only: the technicians (with
 * coordinator and head-technician marked) and the other kepala toko, with
 * their contact, weekly pattern, today, and the tickets they hold now.
 */
export default async function StoreTeamPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { stores } = await requireStoreViewer("page_toko_team");
  if (stores.length === 0) return <NoStores title="Daftar User" />;
  const params = await searchParams;
  const { chosen, shown, ids } = pickStores(stores, params.store);
  // eslint-disable-next-line react-hooks/purity -- server component, read once
  const today = wibDayKey(Date.now());
  const todayDate = new Date(`${today}T00:00:00Z`);

  const [technicians, supervisors] = await Promise.all([
    db.user.findMany({
      where: { role: "Technician", is_active: true, store_assignments: { some: { store_id: { in: ids } } } },
      select: {
        id: true,
        name: true,
        email: true,
        phone_number: true,
        shift: true,
        work_days: true,
        is_team_leader: true,
        is_head_technician: true,
        store_assignments: { where: { store_id: { in: ids } }, select: { store: { select: { name: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({
      where: { role: "StoreSupervisor", is_active: true, supervised_stores: { some: { store_id: { in: ids } } } },
      select: {
        id: true,
        name: true,
        email: true,
        phone_number: true,
        supervised_stores: { where: { store_id: { in: ids } }, select: { store: { select: { name: true } } } },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  const techIds = technicians.map((t) => t.id);
  const [leaves, overrides, activeCounts] = await Promise.all([
    db.technicianLeave.findMany({ where: { technician_id: { in: techIds }, date: todayDate }, select: { technician_id: true, date: true, reason: true } }),
    db.shiftOverride.findMany({
      where: { date: todayDate, OR: [{ original_tech_id: { in: techIds } }, { override_tech_id: { in: techIds } }] },
      select: { original_tech_id: true, override_tech_id: true, date: true, shift: true, original_tech: { select: { name: true } }, override_tech: { select: { name: true } } },
    }),
    db.ticket.groupBy({
      by: ["technician_id"],
      where: { technician_id: { in: techIds }, status: { in: ["waiting", "on_progress"] } },
      _count: { _all: true },
    }),
  ]);
  const names = new Map<string, string>(technicians.map((t) => [t.id, t.name]));
  for (const o of overrides) {
    names.set(o.original_tech_id, o.original_tech.name);
    names.set(o.override_tech_id, o.override_tech.name);
  }
  const leaveRows = leaves.map((l) => ({ technicianId: l.technician_id, day: today, reason: l.reason }));
  const overrideRows = overrides.map((o) => ({ originalId: o.original_tech_id, overrideId: o.override_tech_id, day: today, shift: o.shift }));
  const active = new Map(activeCounts.map((a) => [a.technician_id, a._count._all]));

  const rows: Row[] = [
    ...supervisors.map((s) => ({
      id: s.id,
      name: s.name,
      role: "Kepala Toko",
      stores: s.supervised_stores.map((a) => a.store.name),
      phone: s.phone_number || null,
      email: s.email,
      shift: null,
      workDays: null,
      today: null,
      active: 0,
    })),
    ...technicians.map((t) => {
      const workDays = Array.isArray(t.work_days) ? (t.work_days as string[]) : null;
      return {
        id: t.id,
        name: t.name,
        role: t.is_head_technician ? "Kepala Teknisi" : t.is_team_leader ? "Koordinator" : "Teknisi",
        stores: t.store_assignments.map((a) => a.store.name),
        phone: t.phone_number || null,
        email: t.email,
        shift: t.shift,
        workDays,
        today: scheduleCell({ id: t.id, name: t.name, shift: t.shift, workDays }, today, leaveRows, overrideRows, (id) => names.get(id) ?? "teknisi lain"),
        active: active.get(t.id) ?? 0,
      };
    }),
  ];

  const columns: DataTableColumn<Row>[] = [
    {
      key: "name", sortValue: (r) => r.name,
      header: "Nama",
      mobile: "title",
      cell: (r) => (
        <span className="flex flex-col">
          <span className="font-medium">{r.name}</span>
          <span className="text-xs text-muted-foreground">
            {r.role}
            {shown.length > 1 ? ` · ${r.stores.join(", ")}` : ""}
          </span>
        </span>
      ),
    },
    {
      key: "contact", sortValue: (r) => r.phone,
      header: "Kontak",
      interactive: true,
      cell: (r) => {
        const wa = waLink(r.phone, `Halo ${r.name}, `);
        return (
          <span className="flex flex-col gap-1 text-sm">
            {r.phone ? (
              wa ? (
                <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-primary hover:underline md:min-h-0">
                  <MessageCircle aria-hidden className="size-4" /> {r.phone}
                </a>
              ) : (
                <span>{r.phone}</span>
              )
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
            {r.email && (
              <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:underline">
                <Mail aria-hidden className="size-3.5" /> {r.email}
              </a>
            )}
          </span>
        );
      },
    },
    {
      key: "pattern",
      header: "Jadwal mingguan",
      mobileLabel: "Jadwal",
      cell: (r) =>
        r.role === "Kepala Toko" ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : r.workDays?.length ? (
          <span className="flex flex-col text-sm">
            <span>{shiftLabel(r.shift)}</span>
            <span className="text-xs text-muted-foreground">{WEEK.filter((d) => r.workDays!.includes(d)).map((d) => DAY_NAMES[d]).join(", ")}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">belum diatur</span>
        ),
    },
    {
      key: "today", sortValue: (r) => r.today?.kind,
      header: "Hari ini",
      mobile: "badge",
      cell: (r) =>
        r.today ? (
          <span className={cn("inline-flex w-fit rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", TODAY_STYLE[r.today.kind])}>
            {todayText(r.today)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "active", sortValue: (r) => r.active, sortFirst: "desc",
      header: "Tiket aktif",
      className: "tabular-nums",
      cell: (r) => (r.role === "Kepala Toko" ? "—" : r.active),
    },
  ];

  return (
    <div data-slot="store-team" className="flex flex-col gap-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Contact aria-hidden className="size-6" /> Daftar User
          </span>
        }
        description={`${shown.map((s) => s.name).join(", ")} · ${technicians.length} teknisi`}
        actions={
          stores.length > 1 && (
            <FilterBar action="/toko/tim">
              <FilterBarField label="Toko" htmlFor="tm-store" className="md:w-48">
                <NativeSelect id="tm-store" name="store" defaultValue={chosen?.id ?? ""}>
                  <option value="">Semua toko</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              </FilterBarField>
              <Button type="submit">Tampilkan</Button>
            </FilterBar>
          )
        }
      />

      <DataTable
        caption="Daftar user toko"
        sort={urlSort("/toko/tim", params)}
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        empty={<EmptyState icon={Contact} title="Belum ada user di toko ini" />}
      />
      <p className="text-xs text-muted-foreground">
        Tiket aktif: tiket yang sedang menunggu atau dikerjakan. Jadwal mingguan diatur admin di data user; cuti dan tukar shift oleh koordinator.
      </p>
    </div>
  );
}
