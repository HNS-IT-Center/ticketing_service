"use client";

import { createContext, useContext, useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Receipt, Plus, Pencil, Trash2, Truck, PackageCheck, AlertTriangle, EyeOff, Printer, Link2 } from "lucide-react";
import type { ChargeKind, ServicePart } from "@prisma/client";
import {
  addChargeAction,
  addPartChargeAction,
  linkPartCatalogAction,
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
  formatRupiahCompact,
  summarizeCharges,
  vendorFitsCharge,
  type ChargePermissions,
  type ChargeRow,
  type VendorOption,
} from "@/lib/charges";
import { formatDateTime } from "@/lib/utils";
import RupiahInput from "./RupiahInput";
import CatalogItemPicker from "@/components/catalog/CatalogItemPicker";
import CatalogEntryToggle from "@/components/catalog/CatalogEntryToggle";
import Modal from "@/components/ui/Modal";
import type { CatalogItem } from "@/lib/catalog/items";
import { SERVICE_PART_ORDER, isServicePart, requiresItemName, servicePartLabel } from "@/lib/service-parts";
import { clearDraft, readDraft, useDraft, useDraftKey } from "@/lib/draft";
import type { ServiceJobOption } from "@/lib/service-jobs";
import type { PriceReference } from "@/lib/price-reference";

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
  catalogEnabled = false,
}: {
  ticketId: string;
  lines: ChargeRow[];
  perms: ChargePermissions;
  vendors: VendorOption[];
  /** The Daftar Jasa, for "Jasa service" lines. */
  serviceJobs: ServiceJobOption[];
  /** Whether the catalogue can be searched, to give a typed part its Accurate code. */
  catalogEnabled?: boolean;
}) {
  const router = useRouter();
  const addKey = useDraftKey(addDraftKey(ticketId));
  const [editing, setEditing] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
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

  /** Asked in the app's own dialog, not the browser's — which also blocks the page. */
  const [removing, setRemoving] = useState<ChargeRow | null>(null);
  const remove = (line: ChargeRow) => setRemoving(line);
  const confirmRemove = () => {
    if (!removing) return;
    const line = removing;
    run(() => removeChargeAction(line.id), line.is_part ? "Part dihapus." : "Baris biaya dihapus.", () => setRemoving(null));
  };

  return (
    // `#rincian-biaya` is where the "kode Accurate" reminders link to.
    <div id="rincian-biaya" className="card flex flex-col gap-4" style={{ scrollMarginTop: "5rem" }}>
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
          Jasa, part, dan pekerjaan vendor untuk tiket ini.
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
                  canLink={catalogEnabled && perms.canLinkPartCode}
                  onLink={() => {
                    setEditing(null);
                    setReceiving(null);
                    setLinking(line.id);
                  }}
                />
              )}

              {linking === line.id && (
                <LinkCodeForm
                  pending={pending}
                  onCancel={() => setLinking(null)}
                  onConfirm={(item) =>
                    run(() => linkPartCatalogAction(line.id, item.id), "Kode Accurate ditautkan.", () => setLinking(null))
                  }
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

      {perms.canPrintInvoice && lines.length > 0 && (
        <a
          href={`/faktur/${ticketId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary btn-sm self-start"
          style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
        >
          <Printer size={14} /> Cetak faktur
        </a>
      )}

      {perms.canEdit &&
        (adding ? (
          <AddForm
            draftKey={addKey}
            perms={perms}
            vendors={vendors}
            serviceJobs={serviceJobs}
            catalogEnabled={catalogEnabled}
            pending={pending}
            onCancel={() => setAdding(false)}
            onSubmit={(e) =>
              submit(
                e,
                (fd) => {
                  fd.set("ticket_id", ticketId);
                  return fd.get("kind") === "part" ? addPartChargeAction(fd) : addChargeAction(fd);
                },
                "Biaya ditambahkan.",
                // Saved: only now is the typed input let go of.
                () => {
                  clearDraft(addKey);
                  setAdding(false);
                }
              )
            }
          />
        ) : (
          <button type="button" className="btn btn-secondary btn-sm self-start" onClick={() => setAdding(true)}>
            <Plus size={14} /> Tambah biaya
          </button>
        ))}

      {/* Portalled to <body>: inside the card, an ancestor's transform makes the
          overlay's position: fixed relative to the card, and the dialog lands
          off-screen behind a grey page. */}
      {removing && createPortal(
      <Modal
        open
        onClose={() => !pending && setRemoving(null)}
        title={removing.is_part ? "Hapus part?" : "Hapus baris biaya?"}
      >
        {(
          <div className="flex flex-col gap-3" style={{ marginBottom: "1.5rem" }}>
            <p className="m-0" style={{ color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--text-primary)", wordBreak: "break-word" }}>{removing.description}</strong>{" "}
              akan dihapus dari rincian biaya tiket ini.
            </p>
            <p className="m-0 text-sm" style={{ color: "var(--text-muted)" }}>
              {removing.is_part
                ? "Catatan part, harganya, dan fotonya ikut terhapus. Tidak bisa dibatalkan."
                : removing.kind === "external_service" && externalState(removing) === "at_vendor"
                  ? "Pekerjaan ini masih tercatat di vendor. Catatan pengirimannya ikut terhapus. Tidak bisa dibatalkan."
                  : "Harganya ikut terhapus. Tidak bisa dibatalkan."}
            </p>
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setRemoving(null)}>
            Batal
          </button>
          <button type="button" className="btn btn-danger" disabled={pending} onClick={confirmRemove}>
            {pending ? <span className="spinner spinner-sm" /> : (
              <>
                <Trash2 size={14} /> Hapus
              </>
            )}
          </button>
        </div>
      </Modal>,
      document.body
      )}
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
  canLink,
  onLink,
}: {
  line: ChargeRow;
  perms: ChargePermissions;
  pending: boolean;
  onEdit: () => void;
  onReceive: () => void;
  onRemove: () => void;
  canLink: boolean;
  onLink: () => void;
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
        {line.is_part && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {line.accurate_code ? (
              <span style={{ color: "var(--text-muted)" }}>
                Kode Accurate{" "}
                <strong style={{ fontFamily: "ui-monospace, monospace", color: "var(--text-secondary)" }}>
                  {line.accurate_code}
                </strong>
              </span>
            ) : (
              <>
                <Pill bg="#fef3c7" fg="#92400e" border="#fde68a">
                  Menunggu kode Accurate
                </Pill>
                {canLink && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={pending}
                    onClick={onLink}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                  >
                    <Link2 size={13} /> Masukkan kode
                  </button>
                )}
              </>
            )}
          </div>
        )}
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
              <>
                <Missing>belum diisi</Missing>
                {line.price_reference && (
                  <>
                    {" · "}
                    <PriceHint reference={line.price_reference} />
                  </>
                )}
              </>
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
        </div>
      )}
    </div>
  );
}

/**
 * Give a part typed by hand its Accurate code, once the item is received there.
 * Picking only shows the choice; nothing is saved until it is confirmed, since
 * a wrong link cannot be undone from this panel.
 */
function LinkCodeForm({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  onCancel: () => void;
  onConfirm: (item: CatalogItem) => void;
}) {
  const [picked, setPicked] = useState<CatalogItem | null>(null);
  return (
    <div
      className="flex flex-col gap-3 rounded-lg"
      style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "0.875rem" }}
    >
      <p className="m-0 text-sm font-semibold">Masukkan kode Accurate</p>
      {picked ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold" style={{ color: "#1e3a8a", wordBreak: "break-word" }}>
            {picked.name}
          </span>
          <span className="text-xs" style={{ color: "#1e40af" }}>
            Kode {picked.sku}
            {picked.category ? ` · ${picked.category}` : ""}
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Nama part di tiket dan di faktur akan diganti dengan nama ini. Harga tidak berubah.
          </span>
        </div>
      ) : (
        <CatalogItemPicker
          showStock={false}
          placeholder="Cari kode atau nama barang, mis. baterai asus"
          onPick={setPicked}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {picked && (
          <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => onConfirm(picked)}>
            <Link2 size={14} /> Tautkan
          </button>
        )}
        {picked && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setPicked(null)}>
            Pilih lain
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={onCancel}>
          Batal
        </button>
      </div>
    </div>
  );
}

const SHORT_DATE = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });

/**
 * What this part usually sells for, from past bills: a guide for whoever sets
 * the price, never a rule. Parts are bought per job and marked up on the spot,
 * so this is the only common ground the technicians have.
 */
function PriceHint({ reference }: { reference: PriceReference }) {
  const last = `${formatRupiahCompact(reference.last)}, ${SHORT_DATE.format(new Date(reference.lastAt))}`;
  return (
    <span className="text-xs" style={{ color: "#1e40af" }}>
      {reference.count === 1 || reference.min === reference.max
        ? `Terakhir dijual ${last}`
        : `Biasanya ${formatRupiahCompact(reference.min)}–${formatRupiahCompact(reference.max)} · tengah ${formatRupiahCompact(
            reference.median
          )} · ${reference.count}× · terakhir ${last}`}{" "}
      <span style={{ color: "var(--text-muted)" }}>({reference.label})</span>
    </span>
  );
}

function PriceFields({ line, perms }: { line?: ChargeRow; perms: ChargePermissions }) {
  const draft = useContext(DraftValues);
  if (!perms.canEditPrice && !perms.canEditCost) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {perms.canEditPrice && (
        <div className="flex flex-col gap-1">
          <RupiahInput name="unit_price" label="Harga jual / unit" defaultValue={line ? line.unit_price : draftAmount(draft.unit_price)} />
          {line?.price_reference && <PriceHint reference={line.price_reference} />}
        </div>
      )}
      {perms.canEditCost && <RupiahInput name="unit_cost" label="Harga modal / unit" defaultValue={line ? line.unit_cost : draftAmount(draft.unit_cost)} />}
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
  const draft = useContext(DraftValues);
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
      <select name="vendor_id" defaultValue={current?.id ?? draft.vendor_id ?? ""} required={required} className="form-input">
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
  const draft = useContext(DraftValues);
  if (kind === "service_fee") return <JobFields line={line} perms={perms} serviceJobs={serviceJobs} />;
  const ownFields = !line?.is_part;
  return (
    <>
      {line?.is_part && <PartEditFields line={line} />}
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
              defaultValue={line?.description ?? draft.description ?? ""}
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
              defaultValue={line?.quantity ?? (draft.quantity || 1)}
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
          <textarea name="external_note" rows={2} defaultValue={line?.external_note ?? draft.external_note ?? ""} className="form-input" />
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
  const draft = useContext(DraftValues);
  const [jobId, setJobId] = useState(current?.id ?? draft.service_job_id ?? "");
  const job = serviceJobs.find((j) => j.id === jobId);
  // A job already on the line stays selectable after it was deactivated.
  const keepCurrent = current && !serviceJobs.some((j) => j.id === current.id) ? current : null;
  const keepsJob = line !== undefined && jobId === (current?.id ?? "");
  const suggestedPrice = keepsJob
    ? line.unit_price
    : !line && draft.unit_price !== undefined
      ? draftAmount(draft.unit_price)
      : (job?.default_price ?? null);
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
            defaultValue={line?.quantity ?? (draft.quantity || 1)}
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
          {perms.canEditCost && <RupiahInput name="unit_cost" label="Harga modal / unit" defaultValue={line ? line.unit_cost : draftAmount(draft.unit_cost)} />}
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

/**
 * Editing a part line: its quantity always; its category and name only while
 * it has no Accurate code — once linked, the name is the catalogue's.
 */
function PartEditFields({ line }: { line: ChargeRow }) {
  const [part, setPart] = useState<ServicePart>(line.part ?? "other");
  const linked = Boolean(line.accurate_code);
  const quantity = (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
        Jumlah
      </span>
      <input
        name="quantity"
        type="number"
        min={1}
        max={MAX_CHARGE_QUANTITY}
        defaultValue={line.quantity}
        required
        className="form-input"
        onWheel={(e) => e.currentTarget.blur()}
      />
    </label>
  );
  if (linked) {
    return (
      <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            Barang
          </span>
          <span className="text-sm" style={{ wordBreak: "break-word", paddingTop: "0.4rem" }}>
            {line.description}{" "}
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              · kode {line.accurate_code}
            </span>
          </span>
        </div>
        {quantity}
      </div>
    );
  }
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            Jenis part
          </span>
          <select name="part" value={part} onChange={(e) => setPart(e.target.value as ServicePart)} className="form-input">
            {SERVICE_PART_ORDER.map((p) => (
              <option key={p} value={p}>
                {servicePartLabel(p)}
              </option>
            ))}
          </select>
        </label>
        {quantity}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
          Nama barang{" "}
          {!requiresItemName(part) && (
            <span className="font-normal" style={{ color: "var(--text-muted)" }}>
              — kosongkan kalau belum tahu, tercatat sebagai &ldquo;{servicePartLabel(part)}&rdquo;
            </span>
          )}
        </span>
        <input
          name="item_name"
          defaultValue={line.part_item_name ?? ""}
          required={requiresItemName(part)}
          maxLength={MAX_DESCRIPTION}
          className="form-input"
        />
      </label>
    </>
  );
}

/**
 * A fitted part, added from the bill: the category, then the item picked from
 * the catalogue — or, while Accurate has not received it yet, a plain name
 * whose code is entered later on the line ("Masukkan kode").
 */
function PartFields({
  perms,
  vendors,
  catalogEnabled,
  picked,
  onPick: setPicked,
  typing,
  onTyping: setTyping,
}: {
  perms: ChargePermissions;
  vendors: VendorOption[];
  catalogEnabled: boolean;
  /** Held by the form, so a pick survives a kind switch and a reload. */
  picked: CatalogItem | null;
  onPick: (item: CatalogItem | null) => void;
  typing: boolean;
  onTyping: (typing: boolean) => void;
}) {
  const draft = useContext(DraftValues);
  const [part, setPart] = useState<ServicePart>(
    draft.part && isServicePart(draft.part) ? draft.part : "lcd"
  );
  const nameRequired = requiresItemName(part);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            Jenis part
          </span>
          <select name="part" value={part} onChange={(e) => setPart(e.target.value as ServicePart)} className="form-input">
            {SERVICE_PART_ORDER.map((p) => (
              <option key={p} value={p}>
                {servicePartLabel(p)}
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
            defaultValue={draft.quantity || 1}
            required
            className="form-input"
            onWheel={(e) => e.currentTarget.blur()}
          />
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
          Barang{" "}
          {!nameRequired && (
            <span className="font-normal" style={{ color: "var(--text-muted)" }}>
              — kosongkan kalau belum tahu, tercatat sebagai &ldquo;{servicePartLabel(part)}&rdquo;
            </span>
          )}
        </span>
        {picked ? (
          <div
            className="flex items-start justify-between gap-3 rounded-lg border"
            style={{ borderColor: "#bfdbfe", background: "#eff6ff", padding: "0.6rem 0.75rem" }}
          >
            <input type="hidden" name="catalog_item_id" value={picked.id} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold" style={{ color: "#1e3a8a", wordBreak: "break-word" }}>
                {picked.name}
              </span>
              <span className="text-xs" style={{ color: "#1e40af" }}>
                Kode Accurate {picked.sku}
              </span>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked(null)}>
              Ganti
            </button>
          </div>
        ) : typing ? (
          <>
            <input
              name="item_name"
              required={nameRequired}
              maxLength={MAX_DESCRIPTION}
              defaultValue={draft.item_name ?? ""}
              placeholder={`mis. ${servicePartLabel(part)} — kodenya bisa dimasukkan nanti`}
              className="form-input"
            />
            {catalogEnabled && (
              <CatalogEntryToggle to="search" label="Cari di katalog Accurate" onClick={() => setTyping(false)} />
            )}
          </>
        ) : (
          <>
            <CatalogItemPicker placeholder="Cari kode atau nama barang, mis. lcd 14 fhd" onPick={setPicked} />
            <CatalogEntryToggle
              to="manual"
              question="Barang belum ada di Accurate?"
              label="Ketik nama dulu"
              onClick={() => setTyping(true)}
            />
          </>
        )}
      </div>

      <VendorSelect kind="part" vendors={vendors} />
      <PriceFields perms={perms} />
    </>
  );
}

type AddDraft = {
  kind: ChargeKind;
  /** Every named field as last typed, whatever kind it belongs to. */
  values: Record<string, string>;
  picked: CatalogItem | null;
  typing: boolean;
};

export function addDraftKey(ticketId: string) {
  return `charge-add:${ticketId}`;
}

/**
 * What has been typed is never thrown away by the form itself (owner,
 * 2026-10-27): switching "Jenis biaya" keeps the fields the kinds share
 * (quantity, prices, supplier) and brings back each kind's own when switched
 * back; closing the form or reloading the page keeps it all, autosaved on this
 * device. Only a successful save, or "Kosongkan", clears it.
 */
function AddForm({
  draftKey,
  perms,
  vendors,
  serviceJobs,
  catalogEnabled,
  pending,
  onCancel,
  onSubmit,
}: {
  draftKey: string;
  perms: ChargePermissions;
  vendors: VendorOption[];
  serviceJobs: ServiceJobOption[];
  catalogEnabled: boolean;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  // Read once, on opening. The form only mounts after a click, so this never
  // runs on the server and cannot disagree with it.
  const [initial] = useState(() => readDraft<AddDraft>(draftKey));
  const [kind, setKind] = useState<ChargeKind>(initial?.kind ?? "service_fee");
  const [values, setValues] = useState<Record<string, string>>(initial?.values ?? {});
  const [picked, setPicked] = useState<CatalogItem | null>(initial?.picked ?? null);
  const [typing, setTyping] = useState(initial?.typing ?? !catalogEnabled);
  // Bumped by "Kosongkan" so every field remounts empty.
  const [generation, setGeneration] = useState(0);
  // The cost stays in the form while it is open, but is never written to the
  // browser: it is for those allowed to see it, and this device may be shared.
  useDraft<AddDraft>(draftKey, { kind, values: withoutCost(values), picked, typing });

  const reset = () => {
    clearDraft(draftKey);
    setKind("service_fee");
    setValues({});
    setPicked(null);
    setTyping(!catalogEnabled);
    setGeneration((g) => g + 1);
  };

  const hasInput = Object.values(values).some((v) => v.trim() !== "") || picked !== null;

  return (
    <form
      onSubmit={onSubmit}
      onChange={(e) => {
        // React types the target as the form; the event comes from a field in it.
        const field: EventTarget = e.target;
        if (
          !(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) ||
          !field.name ||
          field.name === "kind" ||
          field.type === "hidden"
        ) {
          return;
        }
        setValues((v) => {
          const next = { ...v, [field.name]: field.value };
          // Another job brings its own default price; the one typed for the
          // previous job must not ride along under the new name.
          if (field.name === "service_job_id") delete next.unit_price;
          return next;
        });
      }}
      className="flex flex-col gap-3 rounded-lg"
      style={{ background: "var(--cream)", padding: "1rem" }}
    >
      {initial && generation === 0 && (
        <p className="m-0 text-xs" style={{ color: "var(--text-muted)" }}>
          Isian sebelumnya dipulihkan.
        </p>
      )}
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
          {/* Part right after the labour, since the two are nearly always recorded together. */}
          {(["service_fee", "part", ...ADDABLE_CHARGE_KINDS.filter((k) => k !== "service_fee")] as ChargeKind[]).map((k) => (
            <option key={k} value={k}>
              {k === "external_service"
                ? "Service eksternal — kirim ke vendor"
                : k === "part"
                  ? "Part — barang yang dipasang"
                  : chargeKindLabel(k)}
            </option>
          ))}
        </select>
      </label>
      {/* Keyed on the kind, so each kind's fields mount afresh — filled from
          what was typed, not emptied. */}
      <DraftValues.Provider value={values}>
        {kind === "part" ? (
          <PartFields
            key={`${kind}:${generation}`}
            perms={perms}
            vendors={vendors}
            catalogEnabled={catalogEnabled}
            picked={picked}
            onPick={setPicked}
            typing={typing}
            onTyping={setTyping}
          />
        ) : (
          <LineFields key={`${kind}:${generation}`} kind={kind} perms={perms} vendors={vendors} serviceJobs={serviceJobs} />
        )}
      </DraftValues.Provider>
      {kind === "external_service" && (
        <p className="m-0 text-xs" style={{ color: "var(--text-muted)" }}>
          Tercatat dikirim ke vendor sekarang. Saat kembali, klik <strong>Terima</strong> lalu catat hasil dan harganya.
          Tiket tidak bisa diselesaikan selama pekerjaan masih di vendor.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <FormButtons
          pending={pending}
          label={kind === "external_service" ? "Kirim ke vendor" : "Tambah"}
          onCancel={onCancel}
        />
        {hasInput && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={reset} style={{ color: "var(--text-muted)" }}>
            Kosongkan
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * The add form's typed values, for fields that mount after a kind switch or a
 * reload. Empty everywhere else, so editing an existing line is unchanged.
 */
const DraftValues = createContext<Record<string, string>>({});

/** The typed values minus the cost price, which is never kept in the browser. */
function withoutCost(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([name]) => name !== "unit_cost"));
}

/** A draft amount ("150.000") as the number RupiahInput takes; null when empty. */
function draftAmount(raw: string | undefined): number | null | undefined {
  if (raw === undefined) return undefined;
  const digits = raw.replace(/\D/g, "");
  return digits ? Number(digits) : null;
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
