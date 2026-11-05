"use client";

import { useId, useRef, useState } from "react";
import {
  AlertTriangle,
  Box,
  Check,
  CircuitBoard,
  Cpu,
  ExternalLink,
  Fan,
  FileText,
  Gpu,
  HardDrive,
  Loader2,
  MemoryStick,
  Monitor,
  Package,
  RefreshCw,
  Trash2,
  Upload,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { QuoteItem, UploadedQuote } from "@/lib/pc-build-quote/parse";

/**
 * The PC build quotation on the intake form: upload the PDF from the web,
 * then tick every component against what the customer actually brought. A
 * line that does not match is not ticked — the person is told to have the
 * quotation revised and upload the new PDF, which replaces the list.
 *
 * Controlled: the form owns the quote and which lines are ticked, so both go
 * into its draft and its submit. The server reads the stored PDF again on
 * create; this list is only for the person at the counter.
 */

const ICONS: [RegExp, LucideIcon][] = [
  [/PROCESSOR|CPU(?! COOLER)/, Cpu],
  [/MOTHERBOARD|MOBO/, CircuitBoard],
  [/\bRAM\b|MEMORY/, MemoryStick],
  [/SSD|NVME|HDD|HARD ?DISK|PENYIMPANAN|STORAGE/, HardDrive],
  [/VGA|GRAPHIC|GPU/, Gpu],
  [/CASING|\bCASE\b/, Box],
  [/POWER|PSU/, Zap],
  [/FAN|COOLER|PENDINGIN/, Fan],
  [/MONITOR/, Monitor],
  [/JASA|SERVICE/, Wrench],
];

function iconFor(label: string): LucideIcon {
  return ICONS.find(([re]) => re.test(label.toUpperCase()))?.[1] ?? Package;
}

const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

/** Lines of `next` that were not on `prev`, and the reverse, by SKU or name. */
function revisionDiff(prev: QuoteItem[], next: QuoteItem[]) {
  const key = (i: QuoteItem) => `${i.sku ?? i.name}×${i.quantity}`;
  const before = new Set(prev.map(key));
  const after = new Set(next.map(key));
  return {
    added: next.filter((i) => !before.has(key(i))).length,
    removed: prev.filter((i) => !after.has(key(i))).length,
  };
}

export function QuoteChecklist({
  quote,
  onQuoteChange,
  checked,
  onCheckedChange,
  error,
}: {
  quote: UploadedQuote | null;
  onQuoteChange: (quote: UploadedQuote | null) => void;
  /** Indexes of the lines ticked as matching. */
  checked: number[];
  onCheckedChange: (checked: number[]) => void;
  error?: string;
}) {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const [revision, setRevision] = useState<{ added: number; removed: number } | null>(null);

  const pick = () => inputRef.current?.click();

  const upload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/pc-build-quote", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as { quote?: UploadedQuote; error?: string };
      if (!res.ok || !json.quote) {
        setUploadError(json.error ?? "PDF quotation gagal dibaca. Coba lagi.");
        return;
      }
      if (quote) setRevision(revisionDiff(quote.items, json.quote.items));
      onQuoteChange(json.quote);
      onCheckedChange([]);
      setMismatch(false);
    } catch {
      setUploadError("Pengiriman gagal, kemungkinan koneksi terputus. Periksa sinyal lalu coba lagi.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const fileInput = (
    <input
      ref={inputRef}
      id={`${uid}-pdf`}
      type="file"
      accept="application/pdf,.pdf"
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void upload(f);
      }}
    />
  );

  const uploadErrorBox = uploadError && (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {uploadError}
    </p>
  );

  if (!quote) {
    return (
      <div data-slot="quote-checklist" className="flex flex-col gap-2">
        {fileInput}
        <button
          type="button"
          onClick={pick}
          disabled={uploading}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-input bg-muted/40 px-4 py-6 text-center outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-wait"
        >
          {uploading ? (
            <Loader2 aria-hidden="true" className="size-7 animate-spin text-primary" />
          ) : (
            <FileText aria-hidden="true" className="size-7 text-primary" />
          )}
          <span className="text-sm font-semibold text-foreground">
            {uploading ? "Membaca PDF quotation…" : "Unggah PDF Quotation Rakitan"}
          </span>
          <span className="max-w-md text-xs text-muted-foreground">
            PDF yang diunduh dari halaman quotation di web. Komponennya dibaca otomatis menjadi daftar centang untuk
            dicocokkan dengan barang yang dibawa.
          </span>
        </button>
        {uploadErrorBox}
      </div>
    );
  }

  const total = quote.items.length;
  const done = checked.length;
  const allChecked = done === total;
  const toggle = (i: number) =>
    onCheckedChange(checked.includes(i) ? checked.filter((n) => n !== i) : [...checked, i].sort((a, b) => a - b));

  return (
    <div data-slot="quote-checklist" className="flex flex-col gap-3">
      {fileInput}

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <FileText aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-mono text-sm font-semibold">{quote.code}</span>
            <span className="text-xs text-muted-foreground">
              {[quote.customer, quote.date, quote.total !== null ? rupiah(quote.total) : null].filter(Boolean).join(" · ")}
            </span>
            <span className="text-xs text-muted-foreground">
              Sales: <span className="font-medium text-foreground">{quote.salesName ?? "tidak tercantum di PDF"}</span>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={quote.url}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "h-11 md:h-8" })}
          >
            <ExternalLink aria-hidden="true" /> Lihat PDF
          </a>
          <Button type="button" variant="outline" size="sm" onClick={pick} disabled={uploading} className="h-11 bg-card md:h-8">
            {uploading ? <Loader2 aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />} Ganti PDF
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onQuoteChange(null);
              onCheckedChange([]);
              setMismatch(false);
              setRevision(null);
            }}
            className="h-11 text-destructive md:h-8"
          >
            <Trash2 aria-hidden="true" /> Hapus
          </Button>
        </div>
      </div>

      {uploadErrorBox}

      {revision && (
        <p className="rounded-lg border border-tone-blue-border bg-tone-blue-bg px-3 py-2.5 text-sm text-tone-blue-fg">
          PDF revisi dibaca:{" "}
          {revision.added || revision.removed
            ? `${revision.added} baris baru/berubah, ${revision.removed} baris lama hilang.`
            : "isi komponennya sama dengan PDF sebelumnya."}{" "}
          Cek ulang semua komponen di bawah.
        </p>
      )}

      {!quote.catalogChecked && (
        <p className="text-xs text-muted-foreground">
          Katalog Accurate sedang tidak bisa dihubungi, jadi SKU belum dicocokkan dengan katalog. Daftar tetap bisa dipakai.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cn("text-sm font-medium", allChecked ? "text-tone-green-fg" : "text-muted-foreground")}>
          {allChecked ? <Check aria-hidden="true" className="mr-1 inline size-4" /> : null}
          {done} dari {total} komponen dicek sesuai
        </p>
        {!allChecked && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onCheckedChange(quote.items.map((_, i) => i))}
            className="h-11 bg-card md:h-8"
          >
            Centang semua
          </Button>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {quote.items.map((item, i) => {
          const Icon = iconFor(item.label);
          const on = checked.includes(i);
          return (
            <li key={`${i}-${item.sku ?? item.name}`}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors",
                  on ? "border-tone-green-border bg-tone-green-bg/60" : "border-border bg-card hover:border-primary/50",
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(i)}
                  className="mt-1 size-5 shrink-0 accent-primary"
                  aria-describedby={`${uid}-meta-${i}`}
                />
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
                    {item.label} · {item.quantity} pcs
                  </span>
                  <span className="text-sm font-semibold wrap-anywhere">{item.name}</span>
                  <span id={`${uid}-meta-${i}`} className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    {item.sku ? <span>SKU {item.sku}</span> : <span>Tanpa SKU</span>}
                    {quote.catalogChecked && item.sku && (
                      item.catalogItemId ? (
                        <span className="text-tone-blue-fg">Ada di katalog Accurate</span>
                      ) : (
                        <span className="text-tone-amber-fg">Tidak ditemukan di katalog</span>
                      )
                    )}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {error && !allChecked && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {mismatch ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-tone-amber-border bg-tone-amber-bg p-4 text-sm text-tone-amber-fg">
          <p className="flex items-start gap-2 font-semibold">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Barang yang dibawa tidak sesuai dengan quotation
          </p>
          <p>
            Tiket tidak bisa dibuat dari quotation yang tidak sesuai. Minta sales merevisi quotation di web supaya
            komponennya sama dengan yang dibawa, unduh PDF terbarunya, lalu unggah di sini. Daftar centang akan diganti.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={pick} disabled={uploading} className="h-11 md:h-9">
              {uploading ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Upload aria-hidden="true" />} Unggah PDF revisi
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMismatch(false)} className="h-11 md:h-9">
              Batal
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setMismatch(true)}
          className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-tone-amber-fg underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-0"
        >
          <AlertTriangle aria-hidden="true" className="size-4" /> Ada yang tidak sesuai?
        </button>
      )}
    </div>
  );
}
