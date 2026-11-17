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
  Search,
  Trash2,
  Upload,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import FilePreview from "@/components/ui/FilePreview";
import { cn } from "@/lib/utils";
import type { QuoteItem, UploadedQuote } from "@/lib/pc-build-quote/parse";
import { checkableIndexes, itemKind } from "@/lib/ecommerce/quote-contract";

/**
 * The PC build quotation on the intake form. Load it by its code (or the link
 * sales send) from the e-commerce site — or, as a fallback, upload its PDF —
 * then tick every component and peripheral against what the customer actually
 * brought. A line that does not match is not ticked: the person is told to
 * have the quotation revised and load it again, which replaces the list.
 *
 * Service lines (the assembly) are not ticked; they are shown apart because
 * they go on the ticket's bill as the technician's job.
 *
 * Controlled: the form owns the quote and which lines are ticked, so both go
 * into its draft and its submit. The server reads the quotation again on
 * create; this list is only for the person at the counter.
 */

const ICONS: [RegExp, LucideIcon][] = [
  [/PROCESSOR|CPU(?! COOLER)/, Cpu],
  [/MOTHERBOARD|MOBO/, CircuitBoard],
  [/\bRAM\b|MEMORY/, MemoryStick],
  [/SSD|NVME|HDD|HARD ?DISK|PENYIMPANAN|STORAGE/, HardDrive],
  [/VGA|GRAPHIC|GPU/, Gpu],
  [/CASING|\bCASE\b/, Box],
  [/POWER|PSU|UPS/, Zap],
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
  apiEnabled = false,
}: {
  quote: UploadedQuote | null;
  onQuoteChange: (quote: UploadedQuote | null) => void;
  /** Indexes of the lines ticked as matching. */
  checked: number[];
  onCheckedChange: (checked: number[]) => void;
  error?: string;
  /** Whether quotations can be loaded from the e-commerce site; off, only the PDF upload is offered. */
  apiEnabled?: boolean;
}) {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"pdf" | "api" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const [revision, setRevision] = useState<{ added: number; removed: number } | null>(null);
  const [ref, setRef] = useState("");
  const [mode, setMode] = useState<"code" | "pdf">(apiEnabled ? "code" : "pdf");

  const pick = () => inputRef.current?.click();

  const accept = (next: UploadedQuote) => {
    if (quote) setRevision(revisionDiff(quote.items, next.items));
    onQuoteChange(next);
    onCheckedChange([]);
    setMismatch(false);
  };

  const request = async (kind: "pdf" | "api", run: () => Promise<Response>, failed: string) => {
    setBusy(kind);
    setLoadError(null);
    try {
      const res = await run();
      const json = (await res.json().catch(() => ({}))) as { quote?: UploadedQuote; error?: string };
      if (!res.ok || !json.quote) {
        setLoadError(json.error ?? failed);
        return;
      }
      accept(json.quote);
    } catch {
      setLoadError("Pengiriman gagal, kemungkinan koneksi terputus. Periksa sinyal lalu coba lagi.");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const upload = (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request("pdf", () => fetch("/api/pc-build-quote", { method: "POST", body: fd }), "PDF quotation gagal dibaca. Coba lagi.");
  };

  const load = (value: string) => {
    const v = value.trim();
    if (!v) {
      setLoadError("Tulis kode quotation atau tempel tautannya.");
      return;
    }
    return request(
      "api",
      () => fetch(`/api/pc-build-quote?ref=${encodeURIComponent(v)}`, { cache: "no-store" }),
      "Quotation gagal dimuat. Coba lagi.",
    );
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

  const errorBox = loadError && (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {loadError}
    </p>
  );

  const pdfDrop = (
    <button
      type="button"
      onClick={pick}
      disabled={busy !== null}
      className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-input bg-muted/40 px-4 py-6 text-center outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-wait"
    >
      {busy === "pdf" ? (
        <Loader2 aria-hidden="true" className="size-7 animate-spin text-primary" />
      ) : (
        <FileText aria-hidden="true" className="size-7 text-primary" />
      )}
      <span className="text-sm font-semibold text-foreground">
        {busy === "pdf" ? "Membaca PDF quotation…" : "Unggah PDF Quotation Rakitan"}
      </span>
      <span className="max-w-md text-xs text-muted-foreground">
        PDF yang diunduh dari halaman quotation di web. Komponennya dibaca otomatis menjadi daftar centang untuk
        dicocokkan dengan barang yang dibawa.
      </span>
    </button>
  );

  if (!quote) {
    return (
      <div data-slot="quote-checklist" className="flex flex-col gap-3">
        {fileInput}
        <div role="radiogroup" aria-label="Cara memasukkan quotation" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {(
            [
              { value: "code", label: "Cari kode", icon: Search, disabled: !apiEnabled },
              { value: "pdf", label: "Upload PDF", icon: Upload, disabled: false },
            ] as const
          ).map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={mode === o.value}
              disabled={o.disabled || busy !== null}
              onClick={() => {
                setMode(o.value);
                setLoadError(null);
              }}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                mode === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <o.icon aria-hidden="true" className="size-4 shrink-0" /> {o.label}
            </button>
          ))}
        </div>
        {!apiEnabled && (
          <p className="text-xs text-muted-foreground">
            Cari kode belum bisa dipakai: Ticketing belum tersambung ke web ecommerce. Pakai PDF dulu.
          </p>
        )}
        {mode === "code" ? (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
            <label htmlFor={`${uid}-ref`} className="text-sm font-semibold">
              Kode quotation atau tautannya
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id={`${uid}-ref`}
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void load(ref);
                  }
                }}
                placeholder="HNSPC-20261116-0171 atau tautan quotation"
                autoComplete="off"
                spellCheck={false}
                className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <Button type="button" onClick={() => void load(ref)} disabled={busy !== null} className="h-11">
                {busy === "api" ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Search aria-hidden="true" />} Muat
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Diambil langsung dari web ecommerce, termasuk nama dan nomor pelanggan. Quotation tidak perlu closing di kasir
              dulu. Kalau web ecommerce sedang tidak bisa, pilih Upload PDF.
            </p>
          </div>
        ) : (
          pdfDrop
        )}
        {errorBox}
      </div>
    );
  }

  const fromApi = quote.source === "api";
  const checkable = checkableIndexes(quote.items);
  const services = quote.items.filter((item) => itemKind(item) === "service");
  const total = checkable.length;
  const done = checked.filter((i) => checkable.includes(i)).length;
  const allChecked = done === total;
  const toggle = (i: number) =>
    onCheckedChange(checked.includes(i) ? checked.filter((n) => n !== i) : [...checked, i].sort((a, b) => a - b));
  const reload = () => (fromApi ? void load(quote.code) : pick());

  return (
    <div data-slot="quote-checklist" className="flex flex-col gap-3">
      {fileInput}

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <FileText aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-mono text-sm font-semibold">
              {quote.code}
              {fromApi && typeof quote.revision === "number" && (
                <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">rev. {quote.revision}</span>
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              {[quote.customer, quote.customerPhone, quote.date, quote.total !== null ? rupiah(quote.total) : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span className="text-xs text-muted-foreground">
              Sales:{" "}
              <span className="font-medium text-foreground">
                {quote.salesName ?? (fromApi ? "tidak tercantum di quotation" : "tidak tercantum di PDF")}
              </span>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {fromApi ? (
            quote.publicUrl && (
              <a
                href={quote.publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "ghost", size: "sm", className: "h-11 md:h-8" })}
              >
                <ExternalLink aria-hidden="true" /> Buka di web
              </a>
            )
          ) : (
            <FilePreview
              url={quote.url}
              fileType="pdf"
              label="Lihat PDF"
              title={`Quotation ${quote.code}`}
              className={buttonVariants({ variant: "ghost", size: "sm", className: "h-11 md:h-8" })}
            />
          )}
          <Button type="button" variant="outline" size="sm" onClick={reload} disabled={busy !== null} className="h-11 bg-card md:h-8">
            {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />}{" "}
            {fromApi ? "Muat ulang" : "Ganti PDF"}
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
              setRef("");
            }}
            className="h-11 text-destructive md:h-8"
          >
            <Trash2 aria-hidden="true" /> Hapus
          </Button>
        </div>
      </div>

      {errorBox}

      {revision && (
        <p className="rounded-lg border border-tone-blue-border bg-tone-blue-bg px-3 py-2.5 text-sm text-tone-blue-fg">
          {fromApi ? "Quotation dimuat ulang:" : "PDF revisi dibaca:"}{" "}
          {revision.added || revision.removed
            ? `${revision.added} baris baru/berubah, ${revision.removed} baris lama hilang.`
            : "isi komponennya sama dengan sebelumnya."}{" "}
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
          {done} dari {total} barang dicek sesuai
        </p>
        {!allChecked && (
          <Button type="button" variant="outline" size="sm" onClick={() => onCheckedChange(checkable)} className="h-11 bg-card md:h-8">
            Centang semua
          </Button>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {quote.items.map((item, i) => {
          const kind = itemKind(item);
          if (kind === "service") return null;
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
                    {item.label || "Komponen"} · {item.quantity} pcs
                  </span>
                  <span className="text-sm font-semibold wrap-anywhere">{item.name}</span>
                  <span id={`${uid}-meta-${i}`} className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    {kind === "peripheral" && <span className="font-medium text-tone-blue-fg">Perlengkapan — tidak dirakit</span>}
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

      {services.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 px-3 py-3">
          <p className="text-xs font-semibold text-muted-foreground">Jasa — masuk Rincian Biaya sebagai jasa teknisi, tidak perlu dicentang</p>
          <ul className="flex flex-col gap-1.5">
            {services.map((item, i) => (
              <li key={`svc-${i}-${item.name}`} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Wrench aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <span className="wrap-anywhere">
                    {item.name}
                    {item.quantity > 1 ? ` ×${item.quantity}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {typeof item.unitPrice === "number" ? rupiah(item.unitPrice * item.quantity) : "harga dari Daftar Jasa"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && !allChecked && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {mismatch ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-tone-amber-border bg-tone-amber-bg p-4 text-sm text-tone-amber-fg">
          <p className="flex items-start gap-2 font-semibold">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Barang yang dibawa tidak sesuai dengan quotation
          </p>
          <p>
            {fromApi
              ? "Tiket tidak bisa dibuat dari quotation yang tidak sesuai. Minta sales merevisi quotation di web supaya komponennya sama dengan yang dibawa, lalu klik Muat ulang. Daftar centang akan diganti."
              : "Tiket tidak bisa dibuat dari quotation yang tidak sesuai. Minta sales merevisi quotation di web supaya komponennya sama dengan yang dibawa, unduh PDF terbarunya, lalu unggah di sini. Daftar centang akan diganti."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={reload} disabled={busy !== null} className="h-11 md:h-9">
              {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : fromApi ? <RefreshCw aria-hidden="true" /> : <Upload aria-hidden="true" />}{" "}
              {fromApi ? "Muat ulang quotation" : "Unggah PDF revisi"}
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
