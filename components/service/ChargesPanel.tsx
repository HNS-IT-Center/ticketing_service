"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Receipt, Plus, Pencil, Trash2, Truck, PackageCheck, AlertTriangle, EyeOff } from "lucide-react";
import type { ChargeKind } from "@prisma/client";
import {
  addChargeAction,
  receiveExternalAction,
  removeChargeAction,
  updateChargeAction,
} from "@/app/actions/charges";
import {
  ADDABLE_CHARGE_KINDS,
  MAX_CHARGE_QUANTITY,
  MAX_DESCRIPTION,
  chargeKindLabel,
  externalResultLabel,
  externalState,
  formatRupiah,
  summarizeCharges,
  vendorFitsCharge,
  type ChargePermissions,
  type ChargeRow,
  type VendorOption,
} from "@/lib/charges";
import { formatDateTime } from "@/lib/utils";
import RupiahInput from "./RupiahInput";
import type { ServiceJobOption } from "@/lib/service-jobs";

type ActionResult = { error: string } | { success: true };

const KIND_STYLE: Record<ChargeKind, { bg: string; fg: string; border: string }> = {
  part: { bg: "#dbeafe", fg: "#1e40af", border: "#bfdbfe" },
  external_service: { bg: "#f3e8ff", fg: "#6b21a8", border: "#e9d5ff" },
  service_fee: { bg: "#dcfce7", fg: "#166534", border: "#bbf7d0" },
  other: { bg: "#f1f5f9", fg: "#334155", border: "#e2e8f0" },
};

const DESCRIPTION_HINT: Record<ChargeKind, string> = {
  part: "",
  external_service: "mis. Perbaikan IC power motherboard",
  service_fee: "mis. Jasa ganti LCD",
  other: "mis. Kabel fleksibel",
};

function Pill({ children, bg, fg, border }: { children: React.ReactNode; bg: string; fg: string; border: string }) {
  return (
    <span
      className="whitespace-nowrap rounded-full text-[0.71875rem] font-bold"
      style={{ background: bg, color: fg, border: `1px solid ${border}`, padding: "0.1rem 0.6rem" }}
    >
      {children}
    </span>
  );
}

function Missing({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-semibold" style={{ color: "#b45309" }}>
      {children}
    </span>
  );
}

/**
 * A service ticket's bill — "Rincian Biaya".
 *
 * Shows what the viewer may see and offers what they may change; both are
 * decided on the server (`chargePermissions`), and a cost the viewer may not
 * see is never in `lines` to begin with. Part lines come from the "Part yang
 * Diganti" panel; here they only get a supplier and their prices.
 */
export default function ChargesPanel({
  ticketId,
  lines,
  perms,
  vendors,
  serviceJobs,
}: {
  ticketId: string;
  lines: ChargeRow[];
  perms: ChargePermissions;
  vendors: VendorOption[];
  /** The Daftar Jasa, for "Jasa service" lines. */
  serviceJobs: ServiceJobOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const summary = summarizeCharges(lines);

  /** Runs an action; the form stays filled when it fails, so nothing is typed twice. */
  const run = (action: () => Promise<ActionResult>, done: string, after: () => void) =>
    start(async () => {
      try {
        const result = await action();
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        toast.success(done);
        after();
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan. Periksa koneksi lalu coba lagi.");
      }
    });

  const submit = (e: FormEvent<HTMLFormElement>, action: (fd: FormData) => Promise<ActionResult>, done: string, after: () => void) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(() => action(fd), done, after);
  };

  const remove = (line: ChargeRow) => {
    if (!window.confirm(`Hapus "${line.description}" dari rincian biaya?`)) return;
    run(() => removeChargeAction(line.id), "Baris biaya dihapus.", () => undefined);
  };

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Receipt size={16} style={{ color: "var(--primary-brand)" }} />
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Rincian Biaya</h3>
          {lines.length > 0 && (
            <span
              className="rounded-full text-[0.71875rem] font-bold"
              style={{ background: "var(--cream)", border: "1px solid var(--border-brand)", color: "var(--text-secondary)", padding: "0.1rem 0.55rem" }}
            >
              {lines.length}
            </span>
          )}
        </div>
        <p className="text-[0.8125rem]" style={{ color: "var(--text-muted)", margin: 0 }}>
          Part dari panel Part yang Diganti otomatis masuk ke sini. Tambahkan jasa service dan pekerjaan
          yang dikirim ke vendor, lalu isi harganya.
        </p>
        {!perms.canViewCost && (
          <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)", margin: 0 }}>
            <EyeOff size={12} /> Harga modal tidak ditampilkan untuk akun Anda.
          </p>
        )}
      </div>

      {lines.length === 0 ? (
        <p className="text-[0.8125rem] italic" style={{ color: "var(--text-muted)", margin: 0 }}>
          Belum ada biaya yang dicatat.
        </p>
      ) : (
        <ul className="flex list-none flex-col">
          {lines.map((line) => (
            <li key={line.id} className="flex flex-col gap-3" style={{ borderTop: "1px solid var(--border-light)", padding: "0.85rem 0" }}>
              {editing === line.id ? (
                <form
                  onSubmit={(e) =>
                    submit(e, (fd) => updateChargeAction(line.id, fd), "Rincian biaya diperbarui.", () => setEditing(null))
                  }
                  className="flex flex-col gap-3 rounded-lg"
                  style={{ background: "var(--cream)", padding: "0.875rem" }}
                >
                  <LineFields kind={line.kind} line={line} perms={perms} vendors={vendors} serviceJobs={serviceJobs} />
                  <FormButtons pending={pending} label="Simpan" onCancel={() => setEditing(null)} />
                </form>
              ) : (
                <LineView
                  line={line}
                  perms={perms}
                  pending={pending}
                  onEdit={() => {
                    setReceiving(null);
                    setEditing(line.id);
                  }}
                  onReceive={() => {
                    setEditing(null);
                    setReceiving(line.id);
                  }}
                  onRemove={() => remove(line)}
                />
              )}

              {receiving === line.id && (
                <form
                  onSubmit={(e) =>
                    submit(e, (fd) => receiveExternalAction(line.id, fd), "Penerimaan dari vendor dicatat.", () =>
                      setReceiving(null)
                    )
                  }
                  className="flex flex-col gap-3 rounded-lg"
                  style={{ background: "#faf5ff", border: "1px solid #e9d5ff", padding: "0.875rem" }}
                >
                  <p className="m-0 text-sm font-semibold">Terima dari {line.vendor?.name ?? "vendor"}</p>
                  <fieldset className="flex flex-wrap gap-4 border-0">
                    {(["repaired", "not_repaired"] as const).map((r) => (
                      <label key={r} className="flex items-center gap-2 text-sm">
                        <input type="radio" name="external_result" value={r} required /> {externalResultLabel(r)}
                      </label>
                    ))}
                  </fieldset>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                      Keterangan dari vendor <span className="font-normal">(wajib bila tidak bisa diperbaiki)</span>
                    </span>
                    <textarea name="external_note" rows={2} className="form-input" defaultValue={line.external_note ?? ""} />
                  </label>
                  <PriceFields line={line} perms={perms} />
                  <FormButtons pending={pending} label="Simpan penerimaan" onCancel={() => setReceiving(null)} />
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {lines.length > 0 && <SummaryView summary={summary} perms={perms} />}

      {perms.canEdit &&
        (adding ? (
          <AddForm
            perms={perms}
            vendors={vendors}
            serviceJobs={serviceJobs}
            pending={pending}
            onCancel={() => setAdding(false)}
            onSubmit={(e) =>
              submit(
                e,
                (fd) => {
                  fd.set("ticket_id", ticketId);
                  return addChargeAction(fd);
                },
                "Biaya ditambahkan.",
                () => setAdding(false)
              )
            }
          />
        ) : (
          <button type="button" className="btn btn-secondary btn-sm self-start" onClick={() => setAdding(true)}>
            <Plus size={14} /> Tambah biaya
          </button>
        ))}
    </div>
  );
}

function LineView({
  line,
  perms,
  pending,
  onEdit,
  onReceive,
  onRemove,
}: {
  line: ChargeRow;
  perms: ChargePermissions;
  pending: boolean;
  onEdit: () => void;
  onReceive: () => void;
  onRemove: () => void;
}) {
  const style = KIND_STYLE[line.kind];
  const state = externalState(line);
  const hasCost = line.unit_cost !== undefined;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Pill {...style}>{chargeKindLabel(line.kind)}</Pill>
          <span className="text-sm font-semibold" style={{ wordBreak: "break-word" }}>
            {line.description}
          </span>
          {line.quantity > 1 && <span className="text-[0.8125rem] font-bold">× {line.quantity}</span>}
          {line.job_points !== null && line.job_points > 0 && (
            <Pill bg="#fef9c3" fg="#854d0e" border="#fde68a">
              +{line.job_points * line.quantity} poin
            </Pill>
          )}
        </div>
        {line.kind === "service_fee" && !line.service_job && perms.canEdit && (
          <p className="m-0 text-xs" style={{ color: "#b45309" }}>
            Diketik bebas, belum dari Daftar Jasa — tidak terhitung di target. Pilih jasanya lewat Ubah.
          </p>
        )}

        {(line.vendor || state) && (
          <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
            {line.vendor && (
              <span className="flex items-center gap-1">
                <Truck size={12} /> {line.vendor.name}
              </span>
            )}
            {state === "at_vendor" && line.sent_at && (
              <Pill bg="#fef3c7" fg="#92400e" border="#fde68a">
                Di vendor sejak {formatDateTime(line.sent_at)}
              </Pill>
            )}
            {state === "returned" && line.external_result && (
              <Pill
                {...(line.external_result === "repaired"
                  ? { bg: "#dcfce7", fg: "#166534", border: "#bbf7d0" }
                  : { bg: "#fee2e2", fg: "#991b1b", border: "#fecaca" })}
              >
                Kembali · {externalResultLabel(line.external_result)}
              </Pill>
            )}
          </div>
        )}
        {line.external_note && (
          <p className="m-0 text-[0.8125rem]" style={{ color: "var(--text-secondary)", wordBreak: "break-word" }}>
            {line.external_note}
          </p>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem]">
          <span>
            Harga jual:{" "}
            {line.unit_price === null ? (
              <Missing>belum diisi</Missing>
            ) : (
              <strong>
                {formatRupiah(line.unit_price)}
                {line.quantity > 1 && ` × ${line.quantity} = ${formatRupiah(line.unit_price * line.quantity)}`}
              </strong>
            )}
          </span>
          {hasCost && (
            <span style={{ color: "var(--text-secondary)" }}>
              Modal:{" "}
              {line.unit_cost === null || line.unit_cost === undefined ? (
                line.kind === "service_fee" ? "—" : <Missing>belum diisi</Missing>
              ) : (
                formatRupiah(line.unit_cost)
              )}
            </span>
          )}
          {perms.canViewMargin && typeof line.unit_cost === "number" && line.unit_price !== null && (
            <span style={{ color: "var(--text-secondary)" }}>
              Margin: {formatRupiah((line.unit_price - line.unit_cost) * line.quantity)}
            </span>
          )}
        </div>
      </div>

      {perms.canEdit && (
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {state === "at_vendor" && (
            <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={onReceive}>
              <PackageCheck size={14} /> Terima
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pending}
            onClick={onEdit}
            aria-label={`Ubah ${line.description}`}
          >
            <Pencil size={14} /> Ubah
          </button>
          {!line.is_part && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={onRemove}
              aria-label={`Hapus ${line.description}`}
              style={{ color: "var(--accent-brand)" }}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PriceFields({ line, perms }: { line?: ChargeRow; perms: ChargePermissions }) {
  if (!perms.canEditPrice && !perms.canEditCost) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {perms.canEditPrice && <RupiahInput name="unit_price" label="Harga jual / unit" defaultValue={line?.unit_price} />}
      {perms.canEditCost && <RupiahInput name="unit_cost" label="Harga modal / unit" defaultValue={line?.unit_cost} />}
    </div>
  );
}

function VendorSelect({
  kind,
  vendors,
  current,
}: {
  kind: ChargeKind;
  vendors: VendorOption[];
  current?: { id: string; name: string } | null;
}) {
  const options = vendors.filter((v) => vendorFitsCharge(kind, v));
  // A vendor already on the line stays selectable even after it was deactivated.
  const keepCurrent = current && !options.some((v) => v.id === current.id);
  const required = kind === "external_service";
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
        {kind === "external_service" ? "Vendor service" : "Supplier"}{" "}
        {!required && <span className="font-normal">(opsional)</span>}
      </span>
      <select name="vendor_id" defaultValue={current?.id ?? ""} required={required} className="form-input">
        <option value="">{required ? "Pilih vendor…" : "—"}</option>
        {keepCurrent && <option value={current.id}>{current.name} (nonaktif)</option>}
        {options.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
      {required && options.length === 0 && (
        <span className="flex items-center gap-1 text-xs" style={{ color: "#b45309" }}>
          <AlertTriangle size={12} /> Belum ada vendor service eksternal. Minta Admin atau Head Teknisi menambahkannya di
          Daftar Vendor.
        </span>
      )}
    </label>
  );
}

/** The fields of a line that may change: everything for a hand-added line, supplier and prices for a part. */
function LineFields({
  kind,
  line,
  perms,
  vendors,
  serviceJobs,
}: {
  kind: ChargeKind;
  line?: ChargeRow;
  perms: ChargePermissions;
  vendors: VendorOption[];
  serviceJobs: ServiceJobOption[];
}) {
  if (kind === "service_fee") return <JobFields line={line} perms={perms} serviceJobs={serviceJobs} />;
  const ownFields = !line?.is_part;
  return (
    <>
      {ownFields && (
        <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
              Keterangan
            </span>
            <input
              name="description"
              required
              maxLength={MAX_DESCRIPTION}
              defaultValue={line?.description ?? ""}
              placeholder={DESCRIPTION_HINT[kind]}
              className="form-input"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
              Jumlah
            </span>
            <input
              name="quantity"
              type="number"
              min={1}
              max={MAX_CHARGE_QUANTITY}
              defaultValue={line?.quantity ?? 1}
              required
              className="form-input"
              onWheel={(e) => e.currentTarget.blur()}
            />
          </label>
        </div>
      )}
      <VendorSelect kind={kind} vendors={vendors} current={line?.vendor} />
      {kind === "external_service" && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            Catatan <span className="font-normal">(opsional — yang dikirim, keluhan, estimasi)</span>
          </span>
          <textarea name="external_note" rows={2} defaultValue={line?.external_note ?? ""} className="form-input" />
        </label>
      )}
      <PriceFields line={line} perms={perms} />
    </>
  );
}

/**
 * A labour line: the job is picked from the Daftar Jasa, never typed. Choosing
 * a job puts its default price in the box — still changeable by whoever may set
 * prices; a line keeping its job keeps its own price.
 */
function JobFields({
  line,
  perms,
  serviceJobs,
}: {
  line?: ChargeRow;
  perms: ChargePermissions;
  serviceJobs: ServiceJobOption[];
}) {
  const current = line?.service_job ?? null;
  const [jobId, setJobId] = useState(current?.id ?? "");
  const job = serviceJobs.find((j) => j.id === jobId);
  // A job already on the line stays selectable after it was deactivated.
  const keepCurrent = current && !serviceJobs.some((j) => j.id === current.id) ? current : null;
  const keepsJob = line !== undefined && jobId === (current?.id ?? "");
  const suggestedPrice = keepsJob ? line.unit_price : (job?.default_price ?? null);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            Jasa
          </span>
          <select
            name="service_job_id"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            required
            className="form-input"
          >
            <option value="">Pilih jasa…</option>
            {keepCurrent && <option value={keepCurrent.id}>{keepCurrent.name} (nonaktif)</option>}
            {serviceJobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
                {j.points > 0 ? ` · ${j.points} poin` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            Jumlah
          </span>
          <input
            name="quantity"
            type="number"
            min={1}
            max={MAX_CHARGE_QUANTITY}
            defaultValue={line?.quantity ?? 1}
            required
            className="form-input"
            onWheel={(e) => e.currentTarget.blur()}
          />
        </label>
      </div>
      {line && !current && (
        <p className="m-0 text-xs" style={{ color: "var(--text-muted)" }}>
          Baris lama ini diketik &ldquo;{line.description}&rdquo;. Pilih jasa yang sesuai supaya terhitung di target.
        </p>
      )}
      {serviceJobs.length === 0 && (
        <p className="m-0 flex items-center gap-1 text-xs" style={{ color: "#b45309" }}>
          <AlertTriangle size={12} /> Daftar Jasa masih kosong. Minta Admin atau Head Teknisi mengisinya.
        </p>
      )}
      {(perms.canEditPrice || perms.canEditCost) && (
        // Keyed on the job, so choosing another one refills the price.
        <div key={jobId} className="grid gap-3 sm:grid-cols-2">
          {perms.canEditPrice && <RupiahInput name="unit_price" label="Harga jual / unit" defaultValue={suggestedPrice} />}
          {perms.canEditCost && <RupiahInput name="unit_cost" label="Harga modal / unit" defaultValue={line?.unit_cost} />}
        </div>
      )}
      {!perms.canEditPrice && job && (
        <p className="m-0 text-xs" style={{ color: "var(--text-muted)" }}>
          Harga jual mengikuti Daftar Jasa
          {job.default_price !== null ? `: ${formatRupiah(job.default_price)}` : " (belum ada harga default)"}.
        </p>
      )}
    </>
  );
}

function AddForm({
  perms,
  vendors,
  serviceJobs,
  pending,
  onCancel,
  onSubmit,
}: {
  perms: ChargePermissions;
  vendors: VendorOption[];
  serviceJobs: ServiceJobOption[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const [kind, setKind] = useState<ChargeKind>("service_fee");
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg" style={{ background: "var(--cream)", padding: "1rem" }}>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
          Jenis biaya
        </span>
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as ChargeKind)}
          className="form-input"
        >
          {ADDABLE_CHARGE_KINDS.map((k) => (
            <option key={k} value={k}>
              {k === "external_service" ? "Service eksternal — kirim ke vendor" : chargeKindLabel(k)}
            </option>
          ))}
        </select>
      </label>
      {/* Keyed on the kind so switching it starts the fields afresh. */}
      <LineFields key={kind} kind={kind} perms={perms} vendors={vendors} serviceJobs={serviceJobs} />
      {kind === "external_service" && (
        <p className="m-0 text-xs" style={{ color: "var(--text-muted)" }}>
          Tercatat dikirim ke vendor sekarang. Saat kembali, klik <strong>Terima</strong> lalu catat hasil dan harganya.
          Tiket tidak bisa diselesaikan selama pekerjaan masih di vendor.
        </p>
      )}
      <FormButtons
        pending={pending}
        label={kind === "external_service" ? "Kirim ke vendor" : "Tambah"}
        onCancel={onCancel}
      />
    </form>
  );
}

function FormButtons({ pending, label, onCancel }: { pending: boolean; label: string; onCancel: () => void }) {
  return (
    <div className="flex gap-2">
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
        {pending ? "Menyimpan…" : label}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={onCancel}>
        Batal
      </button>
    </div>
  );
}

function SummaryView({ summary, perms }: { summary: ReturnType<typeof summarizeCharges>; perms: ChargePermissions }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg text-sm"
      style={{ background: "var(--cream)", border: "1px solid var(--border-brand)", padding: "0.875rem 1rem" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">Total tagihan</span>
        <strong className="text-base">{formatRupiah(summary.total)}</strong>
      </div>
      {summary.unpriced > 0 && (
        <p className="m-0 flex items-center gap-1.5 text-xs" style={{ color: "#b45309" }}>
          <AlertTriangle size={12} /> {summary.unpriced} baris belum ada harga jual — total belum final.
        </p>
      )}
      {perms.canViewCost && (
        <>
          <div className="flex items-baseline justify-between gap-3" style={{ color: "var(--text-secondary)" }}>
            <span>Total modal</span>
            <span>{formatRupiah(summary.cost)}</span>
          </div>
          {summary.uncosted > 0 && (
            <p className="m-0 flex items-center gap-1.5 text-xs" style={{ color: "#b45309" }}>
              <AlertTriangle size={12} /> {summary.uncosted} baris belum ada harga modal.
            </p>
          )}
        </>
      )}
      {perms.canViewMargin && (
        <div className="flex items-baseline justify-between gap-3">
          <span>Margin{!summary.complete && " (sementara)"}</span>
          <strong style={{ color: summary.margin < 0 ? "var(--accent-brand)" : "#166534" }}>
            {formatRupiah(summary.margin)}
          </strong>
        </div>
      )}
    </div>
  );
}
