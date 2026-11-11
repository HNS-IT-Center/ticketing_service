import { ClipboardCheck, MessageCircle } from "lucide-react";
import { pickStores, requireStoreViewer } from "@/lib/store-scope-server";
import { loadFollowups, type FollowupItem } from "@/lib/store-followups-server";
import { FOLLOWUP_INFO, FOLLOWUP_KINDS, isFollowupKind } from "@/lib/store-followups";
import { TICKET_TYPE_LABELS } from "@/lib/ticket-export";
import { FOLLOWUP_ICONS, URGENCY_PILL, followupHref } from "@/components/toko/Followups";
import { NoStores } from "@/components/toko/Sections";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarField } from "@/components/app/FilterBar";
import { FilterChips } from "@/components/app/FilterChips";
import { PageHeader } from "@/components/app/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

export const metadata = { title: "Tindak Lanjut — HNS IT Center" };

type Search = { jenis?: string; store?: string };

/**
 * The full lists behind the dashboard's "Perlu ditindaklanjuti", one tab each,
 * longest waiting first. Read only, except the WhatsApp reminder, which opens
 * the kepala toko's own WhatsApp with the shop's usual message.
 */
export default async function StoreFollowupsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { stores } = await requireStoreViewer();
  if (stores.length === 0) return <NoStores title="Tindak Lanjut" />;
  const params = await searchParams;
  const { chosen, shown, ids } = pickStores(stores, params.store);
  const kind = isFollowupKind(params.jenis) ? params.jenis : "stale";
  // eslint-disable-next-line react-hooks/purity -- server component, read once
  const followups = await loadFollowups(ids, Date.now());
  const items = followups[kind];
  const info = FOLLOWUP_INFO[kind];

  const columns: DataTableColumn<FollowupItem>[] = [
    {
      key: "code",
      header: "Kode",
      mobile: "title",
      cell: (i) => (
        <span className="flex flex-col">
          <span className="font-mono whitespace-nowrap">{i.code}</span>
          <span className="text-xs text-muted-foreground">{TICKET_TYPE_LABELS[i.ticketType]}</span>
        </span>
      ),
    },
    {
      key: "who",
      header: "Customer / unit",
      cell: (i) => (
        <span className="flex min-w-0 max-w-md flex-col">
          <span className="font-medium">{i.customer}</span>
          {i.device && (
            <span title={i.device} className="line-clamp-2 text-xs text-muted-foreground">
              {i.device}
            </span>
          )}
        </span>
      ),
    },
    { key: "tech", header: "Teknisi", className: "whitespace-nowrap text-muted-foreground", cell: (i) => i.technician ?? "—" },
    { key: "detail", header: "Keterangan", mobileLabel: "Keterangan", cell: (i) => <span className="text-sm">{i.detail}</span> },
    {
      key: "days",
      header: "Lama",
      mobile: "badge",
      cell: (i) => (
        <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", URGENCY_PILL[i.urgency])}>
          {i.days} hari
        </span>
      ),
    },
    ...(kind === "pickup"
      ? [
          {
            key: "wa",
            header: "",
            interactive: true,
            mobile: "footer" as const,
            cell: (i: FollowupItem) =>
              i.whatsapp ? (
                <a
                  href={i.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  title="Buka WhatsApp dengan pesan siap diambil"
                >
                  <MessageCircle aria-hidden /> Ingatkan
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">Tanpa no. HP</span>
              ),
          },
        ]
      : []),
  ];

  return (
    <div data-slot="store-followups" className="flex flex-col gap-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ClipboardCheck aria-hidden className="size-6" /> Tindak Lanjut
          </span>
        }
        description={shown.map((s) => s.name).join(", ")}
        actions={
          stores.length > 1 && (
            <FilterBar action="/toko/tindak-lanjut">
              <input type="hidden" name="jenis" value={kind} />
              <FilterBarField label="Toko" htmlFor="tl-store" className="md:w-48">
                <NativeSelect id="tl-store" name="store" defaultValue={chosen?.id ?? ""}>
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

      <FilterChips
        label="Jenis tindak lanjut"
        active={kind}
        chips={FOLLOWUP_KINDS.map((k) => {
          const Icon = FOLLOWUP_ICONS[k];
          return {
            key: k,
            label: `${FOLLOWUP_INFO[k].label} (${followups[k].length})`,
            href: followupHref(k, chosen?.id),
            icon: <Icon aria-hidden />,
          };
        })}
      />

      <p className="text-sm text-muted-foreground">
        {info.hint} Kuning: {info.warnDays} hari atau lebih · merah: {info.overdueDays} hari atau lebih.
      </p>

      <DataTable
        caption={info.label}
        columns={columns}
        rows={items}
        getRowKey={(i) => i.key}
        rowHref={(i) => `/toko/tickets/${i.ticketId}`}
        empty={<EmptyState icon={ClipboardCheck} title="Tidak ada yang perlu ditindaklanjuti di sini" />}
      />
    </div>
  );
}
