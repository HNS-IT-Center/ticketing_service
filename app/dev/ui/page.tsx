import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RmaStatus, TicketStatus } from "@prisma/client";
import { AlertTriangle, CheckCircle2, ClipboardList, Clock, Info, Plus, SearchX, Wrench } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarField, FilterBarSearch } from "@/components/app/FilterBar";
import { PageHeader } from "@/components/app/PageHeader";
import { Pagination } from "@/components/app/Pagination";
import { StatCard, StatCardSkeleton } from "@/components/app/StatCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { TicketBadgeChoice } from "@/lib/rma/ticket-status-badge";
import { OverlayDemos } from "./OverlayDemos";
import { SharedDemos } from "./SharedDemos";

/**
 * /dev/ui — every design-system piece on one page, for visual review.
 *
 * Not part of the product: it answers 404 in a production build, and it reads
 * no data — every row below is made up, and nothing reads the clock, so the
 * server's HTML and the first client render are identical.
 */

export const metadata: Metadata = {
  title: "UI kit — HNS Service Center",
  robots: { index: false, follow: false },
};

type SampleTicket = {
  code: string;
  customer: string;
  device: string;
  technician: string | null;
  badge: TicketBadgeChoice;
  date: string;
};

const SAMPLE_TICKETS: SampleTicket[] = [
  { code: "NGW-000043", customer: "Andi Saputra", device: "ASUS TUF F15", technician: "Budi", badge: { kind: "ticket", status: "on_progress" }, date: "27 Okt 2026" },
  { code: "NGS-000112", customer: "Rina Pratiwi", device: "Lenovo IdeaPad 3", technician: null, badge: { kind: "ticket", status: "waiting" }, date: "27 Okt 2026" },
  { code: "NGW-000051", customer: "PT Sinar Batam Jaya", device: "Axioo Hype 5", technician: "Siti", badge: { kind: "rma", status: "in_vendor_process" }, date: "25 Okt 2026" },
  { code: "NGS-000108", customer: "Dewi Lestari", device: "PC rakitan Ryzen 5", technician: "Agus", badge: { kind: "ticket", status: "ready_for_pickup" }, date: "24 Okt 2026" },
];

const COLUMNS: DataTableColumn<SampleTicket>[] = [
  { key: "code", header: "Kode", cell: (t) => t.code, mobile: "title" },
  { key: "customer", header: "Pelanggan", cell: (t) => t.customer, mobile: "detail" },
  { key: "device", header: "Perangkat", cell: (t) => t.device, mobile: "detail", className: "max-w-56 truncate" },
  {
    key: "technician",
    header: "Teknisi",
    cell: (t) => t.technician ?? <span className="font-medium text-destructive">Unassigned</span>,
    mobile: "detail",
  },
  { key: "status", header: "Status", cell: (t) => <StatusBadge {...t.badge} size="sm" />, mobile: "badge" },
  { key: "date", header: "Masuk", cell: (t) => t.date, mobile: "hidden", className: "text-muted-foreground" },
];

const COLORS = [
  { name: "primary", hex: "#16469d", swatch: "bg-primary", note: "Tombol utama, link, fokus. Putih di atasnya 8,8:1" },
  { name: "destructive", hex: "#cd2426", swatch: "bg-destructive", note: "Hapus, batal, tolak. Putih di atasnya 5,4:1" },
  { name: "background", hex: "#f7f2ec", swatch: "bg-background", note: "Latar halaman (cream)" },
  { name: "card", hex: "#ffffff", swatch: "bg-card", note: "Kartu, tabel, popover" },
  { name: "muted", hex: "#ede7de", swatch: "bg-muted", note: "Header tabel, latar tenang" },
  { name: "muted-foreground", hex: "#5c6676", swatch: "bg-muted-foreground", note: "Teks sekunder. 5,2:1 di cream" },
  { name: "secondary", hex: "#e8eef8", swatch: "bg-secondary", note: "Tombol sekunder, menu aktif" },
  { name: "border", hex: "#ddd6cf", swatch: "bg-border", note: "Garis kartu dan pemisah" },
  { name: "input", hex: "#8a8279", swatch: "bg-input", note: "Garis input. 3,8:1 (batas kontrol ≥ 3:1)" },
];

const TYPE_SCALE = [
  { cls: "text-2xl font-bold tracking-tight", use: "Judul halaman (md+) · text-2xl bold" },
  { cls: "text-xl font-bold tracking-tight", use: "Judul halaman (HP) · text-xl bold" },
  { cls: "text-base font-semibold", use: "Judul bagian · text-base semibold" },
  { cls: "text-base", use: "Isi di HP, input · text-base" },
  { cls: "text-sm", use: "Isi di desktop, tabel · text-sm" },
  { cls: "text-xs font-medium text-muted-foreground", use: "Label kecil, keterangan · text-xs" },
];

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 border-b border-border pb-2">
        <h2 id={id} className="text-lg font-bold text-foreground">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main data-slot="dev-ui" className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        breadcrumb={[{ label: "Dev", href: "/dev/ui" }, { label: "UI kit" }]}
        title="Sistem desain HNS"
        description="Semua komponen Phase 1 di satu halaman. Hanya ada di development."
        actions={
          <>
            <Button variant="outline">Ekspor</Button>
            <Button>
              <Plus aria-hidden="true" />
              Buat Tiket
            </Button>
          </>
        }
      />

      <Section id="tokens" title="Warna" description="Token shadcn yang sekarang memakai warna HNS. Semua pasangan teks lolos WCAG AA.">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COLORS.map((c) => (
            <li key={c.name} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <span aria-hidden="true" className={`size-12 shrink-0 rounded-lg border border-border ${c.swatch}`} />
              <div className="flex min-w-0 flex-col">
                <code className="text-sm font-semibold text-foreground">--{c.name}</code>
                <span className="text-xs text-muted-foreground">{c.hex}</span>
                <span className="text-xs text-muted-foreground">{c.note}</span>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="type" title="Tipografi, radius, bayangan" description="Inter. Skala Tailwind bawaan; spasi kelipatan 4 px (gap-2 rapat, gap-4/6 antarbagian).">
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
            {TYPE_SCALE.map((t) => (
              <li key={t.use} className="flex flex-col gap-1 px-4 py-3">
                <span className={`text-foreground ${t.cls}`}>Servis laptop selesai hari ini</span>
                <span className="text-xs text-muted-foreground">{t.use}</span>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex aspect-square items-end rounded-sm border border-border bg-card p-2 text-xs text-muted-foreground">rounded-sm</div>
            <div className="flex aspect-square items-end rounded-lg border border-border bg-card p-2 text-xs text-muted-foreground">rounded-lg</div>
            <div className="flex aspect-square items-end rounded-xl bg-card p-2 text-xs text-muted-foreground shadow-sm">shadow-sm</div>
            <div className="flex aspect-square items-end rounded-xl bg-card p-2 text-xs text-muted-foreground shadow-lg">shadow-lg</div>
          </div>
        </div>
      </Section>

      <Section id="status" title="StatusBadge" description="Satu komponen untuk semua status. Label tiket masih yang dipakai staf sekarang; versi Bahasa Indonesia menunggu persetujuan owner.">
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 md:p-5">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">TicketStatus</h3>
            <div className="flex flex-wrap gap-2">
              {Object.values(TicketStatus).map((s) => (
                <StatusBadge key={s} kind="ticket" status={s} />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">RmaStatus</h3>
            <div className="flex flex-wrap gap-2">
              {Object.values(RmaStatus).map((s) => (
                <StatusBadge key={s} kind="rma" status={s} />
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section id="buttons" title="Tombol" description="Di bawah md semua ukuran setinggi minimal 44 px.">
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 md:p-5">
          <div className="flex flex-wrap gap-2">
            <Button>Utama</Button>
            <Button variant="secondary">Sekunder</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destruktif</Button>
            <Button variant="link">Link</Button>
            <Button disabled>Nonaktif</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="lg">
              <Wrench aria-hidden="true" />
              Ambil Tiket
            </Button>
            <Button size="sm" variant="outline">
              Kecil
            </Button>
            <Button size="icon" variant="outline" aria-label="Tambah">
              <Plus aria-hidden="true" />
            </Button>
          </div>
        </div>
      </Section>

      <Section id="forms" title="Form" description="Label selalu terlihat. Error ditandai aria-invalid dan dijelaskan dengan teks.">
        <div className="grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-2 md:p-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-name">Nama pelanggan</Label>
            <Input id="f-name" placeholder="Andi Saputra" autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-phone">Nomor WhatsApp</Label>
            <Input id="f-phone" inputMode="tel" defaultValue="+62812" aria-invalid="true" aria-describedby="f-phone-error" />
            <p id="f-phone-error" className="text-sm text-destructive">
              Nomor terlalu pendek.
            </p>
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label htmlFor="f-issue">Keluhan</Label>
            <Textarea id="f-issue" placeholder="Laptop mati total setelah kena air" />
          </div>
        </div>
      </Section>

      <Section id="stats" title="StatCard" description="Angka yang minta tindakan tampil merah hanya kalau bukan nol.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Perlu Perhatian" value={4} icon={AlertTriangle} tone="attention" hint="Lewat batas SLA" href="/dev/ui#stats" />
          <StatCard label="Sedang Dikerjakan" value={12} icon={Wrench} />
          <StatCard label="Selesai bulan ini" value={38} icon={CheckCircle2} tone="success" hint="+6 dari bulan lalu" />
          <StatCardSkeleton />
        </div>
      </Section>

      <Section id="table" title="FilterBar, DataTable, Pagination" description="Tabel di desktop, kartu di HP. Kecilkan jendela ke 360 px untuk melihat versi kartu.">
        <FilterBar action="/dev/ui">
          <FilterBarSearch label="Cari tiket" placeholder="Cari kode, nama, atau perangkat" />
          <FilterBarField label="Teknisi" htmlFor="filter-tech">
            <Input id="filter-tech" name="tech" placeholder="Semua" className="bg-card" />
          </FilterBarField>
          <Button type="submit" variant="secondary">
            Terapkan
          </Button>
        </FilterBar>
        <DataTable
          caption="Contoh daftar tiket"
          columns={COLUMNS}
          rows={SAMPLE_TICKETS}
          getRowKey={(t) => t.code}
          rowHref={(t) => `/dev/ui?tiket=${t.code}#table`}
        />
        <Pagination page={2} pageCount={7} totalItems={134} pageSize={20} hrefForPage={(p) => `/dev/ui?page=${p}#table`} />

        <h3 className="text-sm font-semibold text-foreground">Sedang memuat</h3>
        <DataTable caption="Daftar tiket sedang dimuat" columns={COLUMNS} rows={[]} getRowKey={(t) => t.code} loading skeletonRows={3} />

        <h3 className="text-sm font-semibold text-foreground">Kosong</h3>
        <DataTable
          caption="Daftar tiket kosong"
          columns={COLUMNS}
          rows={[]}
          getRowKey={(t) => t.code}
          empty={
            <EmptyState
              icon={SearchX}
              title="Tidak ada tiket yang cocok"
              description="Coba kata kunci lain atau hapus filter teknisi."
              action={<Button variant="outline">Hapus filter</Button>}
            />
          }
        />
      </Section>

      <Section id="states" title="EmptyState, Alert, Skeleton">
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState
            icon={ClipboardList}
            title="Belum ada tiket hari ini"
            description="Tiket baru dari toko akan muncul di sini."
            action={
              <Button>
                <Plus aria-hidden="true" />
                Buat Tiket
              </Button>
            }
          />
          <div className="flex flex-col gap-3">
            <Alert variant="info">
              <Info aria-hidden="true" />
              <AlertTitle>Menunggu persetujuan</AlertTitle>
              <AlertDescription>Permintaan ambil tiket sudah dikirim ke Store Coordinator.</AlertDescription>
            </Alert>
            <Alert variant="success">
              <CheckCircle2 aria-hidden="true" />
              <AlertTitle>Bukti terunggah</AlertTitle>
              <AlertDescription>3 foto, total 6,2 MB.</AlertDescription>
            </Alert>
            <Alert variant="warning">
              <Clock aria-hidden="true" />
              <AlertTitle>Draf dipulihkan</AlertTitle>
              <AlertDescription>Isian yang belum terkirim dari sesi sebelumnya sudah dikembalikan.</AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <AlertTriangle aria-hidden="true" />
              <AlertTitle>Gagal mengunggah</AlertTitle>
              <AlertDescription>Ukuran file melebihi 9 MB. Kompres video lalu coba lagi.</AlertDescription>
            </Alert>
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4" aria-hidden="true">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        </div>
      </Section>

      <Section id="overlays" title="Overlay dan interaksi" description="Dialog, ConfirmDialog, DropdownMenu, Sheet, Tooltip, Select, Tabs, toast. Semua bisa dipakai pakai keyboard.">
        <OverlayDemos />
      </Section>

      <Section id="shared" title="Komponen bersama" description="FileUpload, FilePreview, TagInput, RupiahInput: dipakai di dalam alur (langkah wizard, ganti status), jadi dicek di sini.">
        <SharedDemos />
      </Section>
    </main>
  );
}
