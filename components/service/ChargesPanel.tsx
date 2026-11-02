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
import { cn, formatDateTime } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { TONE_CLASSES, type StatusTone } from "@/lib/status-display";
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

/** The shadcn field look, for the native inputs and selects this form keeps. */
const FIELD =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 py-1 text-base text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive md:h-9 md:text-sm";
const TEXTAREA =
  "min-h-16 w-full min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-base text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";
const LABEL = "text-xs font-semibold text-muted-foreground";
const DANGER_SOLID = "bg-destructive text-white hover:bg-destructive/90";

const KIND_TONE: Record<ChargeKind, StatusTone> = {
  part: "blue",
  external_service: "violet",
  service_fee: "green",
  other: "gray",
};

const DESCRIPTION_HINT: Record<ChargeKind, string> = {
  part: "",
  external_service: "mis. Perbaikan IC power motherboard",
  service_fee: "mis. Jasa ganti LCD",
  other: "mis. Kabel fleksibel",
};

function Pill({ children, tone }: { children: React.ReactNode; tone: StatusTone }) {
  return (
    <span className={cn("whitespace-nowrap rounded-full border px-2.5 py-px text-[0.71875rem] font-bold", TONE_CLASSES[tone])}>
      {children}
    </span>
  );
}

function Missing({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-semibold text-tone-amber-fg">
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
    // A self-contained card (own data-slot), so it renders the same inside the
    // legacy ticket pages that still embed it.
    <div data-slot="charges-panel" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs md:p-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Receipt aria-hidden="true" className="size-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">Rincian Biaya</h3>
          {lines.length > 0 && (
            <span
              className="rounded-full border border-border bg-muted px-2 py-px text-[0.71875rem] font-bold text-muted-foreground"
            >
              {lines.length}
            </span>
          )}
        </div>
        <p className="text-[0.8125rem] text-muted-foreground">
          Jasa, part, dan pekerjaan vendor untuk tiket ini.
        </p>
        {!perms.canViewCost && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <EyeOff aria-hidden="true" size={12} /> Harga modal tidak ditampilkan untuk akun Anda.
          </p>
        )}
      </div>

      {lines.length === 0 ? (
        <p className="text-[0.8125rem] text-muted-foreground italic">
          Belum ada biaya yang dicatat.
        </p>
      ) : (
        <ul className="flex list-none flex-col">
          {lines.map((line) => (
            <li key={line.id} className="flex flex-col gap-3 border-t border-border py-3.5">
              {editing === line.id ? (
                <form
                  onSubmit={(e) =>
                    submit(e, (fd) => updateChargeAction(line.id, fd), "Rincian biaya diperbarui.", () => setEditing(null))
                  }
                  className="flex flex-col gap-3 rounded-lg bg-muted p-3.5"
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
                  className={cn("flex flex-col gap-3 rounded-lg border p-3.5 text-foreground", TONE_CLASSES.violet)}
                >
                  <p className="m-0 text-sm font-semibold">Terima dari {line.vendor?.name ?? "vendor"}</p>
                  <fieldset className="flex flex-wrap gap-4 border-0">
                    {(["repaired", "not_repaired"] as const).map((r) => (
                      <label key={r} className="flex min-h-11 items-center gap-2 text-sm text-foreground md:min-h-0">
                        <input type="radio" name="external_result" value={r} required className="size-5 accent-primary md:size-4" /> {externalResultLabel(r)}
                      </label>
                    ))}
                  </fieldset>
                  <label className="flex flex-col gap-1">
                    <span className={LABEL}>
                      Keterangan dari vendor <span className="font-normal">(wajib bila tidak bisa diperbaiki)</span>
                    </span>
                    <textarea name="external_note" rows={2} className={TEXTAREA} defaultValue={line.external_note ?? ""} />
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
          className={buttonVariants({ variant: "outline", size: "sm", className: "self-start bg-card" })}
        >
          <Printer aria-hidden="true" size={14} /> Cetak faktur
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
          <button type="button" className={buttonVariants({ variant: "outline", size: "sm", className: "self-start bg-card" })} onClick={() => setAdding(true)}>
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
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground">
              <strong className="text-foreground [overflow-wrap:anywhere]">{removing.description}</strong>{" "}
              akan dihapus dari rincian biaya tiket ini.
            </p>
            <p className="text-sm text-muted-foreground">
              {removing.is_part
                ? "Catatan part, harganya, dan fotonya ikut terhapus. Tidak bisa dibatalkan."
                : removing.kind === "external_service" && externalState(removing) === "at_vendor"
                  ? "Pekerjaan ini masih tercatat di vendor. Catatan pengirimannya ikut terhapus. Tidak bisa dibatalkan."
                  : "Harganya ikut terhapus. Tidak bisa dibatalkan."}
            </p>
          </div>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={buttonVariants({ variant: "ghost" })} disabled={pending} onClick={() => setRemoving(null)}>
            Batal
          </button>
          <button type="button" className={buttonVariants({ className: DANGER_SOLID })} disabled={pending} onClick={confirmRemove}>
            {pending ? <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : (
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
  const tone = KIND_TONE[line.kind];
  const state = externalState(line);
  const hasCost = line.unit_cost !== undefined;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={tone}>{chargeKindLabel(line.kind)}</Pill>
          <span className="text-sm font-semibold [overflow-wrap:anywhere]">
            {line.description}
          </span>
          {line.quantity > 1 && <span className="text-[0.8125rem] font-bold">× {line.quantity}</span>}
          {line.job_points !== null && line.job_points > 0 && (
            <Pill tone="amber">
              +{line.job_points * line.quantity} poin
            </Pill>
          )}
        </div>
        {line.is_part && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {line.accurate_code ? (
              <span className="text-muted-foreground">
                Kode Accurate{" "}
                <strong className="font-mono text-foreground">
                  {line.accurate_code}
                </strong>
              </span>
            ) : (
              <>
                <Pill tone="amber">
                  Menunggu kode Accurate
                </Pill>
                {canLink && (
                  <button
                    type="button"
                    className={buttonVariants({ variant: "outline", size: "sm", className: "bg-card" })}
                    disabled={pending}
                    onClick={onLink}
                  >
                    <Link2 size={13} /> Masukkan kode
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {line.kind === "service_fee" && !line.service_job && perms.canEdit && (
          <p className="text-xs text-tone-amber-fg">
            Diketik bebas, belum dari Daftar Jasa — tidak terhitung di target. Pilih jasanya lewat Ubah.
          </p>
        )}

        {(line.vendor || state) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {line.vendor && (
              <span className="flex items-center gap-1">
                <Truck size={12} /> {line.vendor.name}
              </span>
            )}
            {state === "at_vendor" && line.sent_at && (
              <Pill tone="amber">
                Di vendor sejak {formatDateTime(line.sent_at)}
              </Pill>
            )}
            {state === "returned" && line.external_result && (
              <Pill tone={line.external_result === "repaired" ? "green" : "red"}>
                Kembali · {externalResultLabel(line.external_result)}
              </Pill>
            )}
          </div>
        )}
        {line.external_note && (
          <p className="text-[0.8125rem] text-muted-foreground [overflow-wrap:anywhere]">
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
            <span className="text-muted-foreground">
              Modal:{" "}
              {line.unit_cost === null || line.unit_cost === undefined ? (
                line.kind === "service_fee" ? "—" : <Missing>belum diisi</Missing>
              ) : (
                formatRupiah(line.unit_cost)
              )}
            </span>
          )}
          {perms.canViewMargin && typeof line.unit_cost === "number" && line.unit_price !== null && (
            <span className="text-muted-foreground">
              Margin: {formatRupiah((line.unit_price - line.unit_cost) * line.quantity)}
            </span>
          )}
        </div>
      </div>

      {perms.canEdit && (
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {state === "at_vendor" && (
            <button type="button" className={buttonVariants({ size: "sm" })} disabled={pending} onClick={onReceive}>
              <PackageCheck size={14} /> Terima
            </button>
          )}
          <button
            type="button"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
            disabled={pending}
            onClick={onEdit}
            aria-label={`Ubah ${line.description}`}
          >
            <Pencil size={14} /> Ubah
          </button>
          <button
            type="button"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "text-destructive hover:text-destructive" })}
            disabled={pending}
            onClick={onRemove}
            aria-label={`Hapus ${line.description}`}
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
      className={cn("flex flex-col gap-3 rounded-lg border p-3.5", TONE_CLASSES.blue)}
    >
      <p className="text-sm font-semibold">Masukkan kode Accurate</p>
      {picked ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold [overflow-wrap:anywhere]">
            {picked.name}
          </span>
          <span className="text-xs">
            Kode {picked.sku}
            {picked.category ? ` · ${picked.category}` : ""}
          </span>
          <span className="text-xs text-muted-foreground">
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
          <button type="button" className={buttonVariants({ size: "sm" })} disabled={pending} onClick={() => onConfirm(picked)}>
            <Link2 size={14} /> Tautkan
          </button>
        )}
        {picked && (
          <button type="button" className={buttonVariants({ variant: "ghost", size: "sm" })} disabled={pending} onClick={() => setPicked(null)}>
            Pilih lain
          </button>
        )}
        <button type="button" className={buttonVariants({ variant: "ghost", size: "sm" })} disabled={pending} onClick={onCancel}>
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
    <span className="text-xs text-tone-blue-fg">
      {reference.count === 1 || reference.min === reference.max
        ? `Terakhir dijual ${last}`
        : `Biasanya ${formatRupiahCompact(reference.min)}–${formatRupiahCompact(reference.max)} · tengah ${formatRupiahCompact(
            reference.median
          )} · ${reference.count}× · terakhir ${last}`}{" "}
      <span className="text-muted-foreground">({reference.label})</span>
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
      <span className={LABEL}>
        {kind === "external_service" ? "Vendor service" : "Supplier"}{" "}
        {!required && <span className="font-normal">(opsional)</span>}
      </span>
      <select name="vendor_id" defaultValue={current?.id ?? draft.vendor_id ?? ""} required={required} className={FIELD}>
        <option value="">{required ? "Pilih vendor…" : "—"}</option>
        {keepCurrent && <option value={current.id}>{current.name} (nonaktif)</option>}
        {options.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
      {required && options.length === 0 && (
        <span className="flex items-center gap-1 text-xs text-tone-amber-fg">
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
            <span className={LABEL}>
              Keterangan
            </span>
            <input
              name="description"
              required
              maxLength={MAX_DESCRIPTION}
              defaultValue={line?.description ?? draft.description ?? ""}
              placeholder={DESCRIPTION_HINT[kind]}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>
              Jumlah
            </span>
            <input
              name="quantity"
              type="number"
              min={1}
              max={MAX_CHARGE_QUANTITY}
              defaultValue={line?.quantity ?? (draft.quantity || 1)}
              required
              className={FIELD}
              onWheel={(e) => e.currentTarget.blur()}
            />
          </label>
        </div>
      )}
      <VendorSelect kind={kind} vendors={vendors} current={line?.vendor} />
      {kind === "external_service" && (
        <label className="flex flex-col gap-1">
          <span className={LABEL}>
            Catatan <span className="font-normal">(opsional — yang dikirim, keluhan, estimasi)</span>
          </span>
          <textarea name="external_note" rows={2} defaultValue={line?.external_note ?? draft.external_note ?? ""} className={TEXTAREA} />
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
          <span className={LABEL}>
            Jasa
          </span>
          <select
            name="service_job_id"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            required
            className={FIELD}
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
          <span className={LABEL}>
            Jumlah
          </span>
          <input
            name="quantity"
            type="number"
            min={1}
            max={MAX_CHARGE_QUANTITY}
            defaultValue={line?.quantity ?? (draft.quantity || 1)}
            required
            className={FIELD}
            onWheel={(e) => e.currentTarget.blur()}
          />
        </label>
      </div>
      {line && !current && (
        <p className="text-xs text-muted-foreground">
          Baris lama ini diketik &ldquo;{line.description}&rdquo;. Pilih jasa yang sesuai supaya terhitung di target.
        </p>
      )}
      {serviceJobs.length === 0 && (
        <p className="flex items-center gap-1 text-xs text-tone-amber-fg">
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
        <p className="text-xs text-muted-foreground">
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
      <span className={LABEL}>
        Jumlah
      </span>
      <input
        name="quantity"
        type="number"
        min={1}
        max={MAX_CHARGE_QUANTITY}
        defaultValue={line.quantity}
        required
        className={FIELD}
        onWheel={(e) => e.currentTarget.blur()}
      />
    </label>
  );
  if (linked) {
    return (
      <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
        <div className="flex min-w-0 flex-col gap-1">
          <span className={LABEL}>
            Barang
          </span>
          <span className="pt-1.5 text-sm [overflow-wrap:anywhere]">
            {line.description}{" "}
            <span className="text-xs text-muted-foreground">
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
          <span className={LABEL}>
            Jenis part
          </span>
          <select name="part" value={part} onChange={(e) => setPart(e.target.value as ServicePart)} className={FIELD}>
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
        <span className={LABEL}>
          Nama barang{" "}
          {!requiresItemName(part) && (
            <span className="font-normal">
              — kosongkan kalau belum tahu, tercatat sebagai &ldquo;{servicePartLabel(part)}&rdquo;
            </span>
          )}
        </span>
        <input
          name="item_name"
          defaultValue={line.part_item_name ?? ""}
          required={requiresItemName(part)}
          maxLength={MAX_DESCRIPTION}
          className={FIELD}
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
          <span className={LABEL}>
            Jenis part
          </span>
          <select name="part" value={part} onChange={(e) => setPart(e.target.value as ServicePart)} className={FIELD}>
            {SERVICE_PART_ORDER.map((p) => (
              <option key={p} value={p}>
                {servicePartLabel(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>
            Jumlah
          </span>
          <input
            name="quantity"
            type="number"
            min={1}
            max={MAX_CHARGE_QUANTITY}
            defaultValue={draft.quantity || 1}
            required
            className={FIELD}
            onWheel={(e) => e.currentTarget.blur()}
          />
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <span className={LABEL}>
          Barang{" "}
          {!nameRequired && (
            <span className="font-normal">
              — kosongkan kalau belum tahu, tercatat sebagai &ldquo;{servicePartLabel(part)}&rdquo;
            </span>
          )}
        </span>
        {picked ? (
          <div
            className={cn("flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5", TONE_CLASSES.blue)}
          >
            <input type="hidden" name="catalog_item_id" value={picked.id} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold [overflow-wrap:anywhere]">
                {picked.name}
              </span>
              <span className="text-xs">
                Kode Accurate {picked.sku}
              </span>
            </div>
            <button type="button" className={buttonVariants({ variant: "ghost", size: "sm" })} onClick={() => setPicked(null)}>
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
              className={FIELD}
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
      className="flex flex-col gap-3 rounded-lg bg-muted p-4"
    >
      {initial && generation === 0 && (
        <p className="text-xs text-muted-foreground">
          Isian sebelumnya dipulihkan.
        </p>
      )}
      <label className="flex flex-col gap-1">
        <span className={LABEL}>
          Jenis biaya
        </span>
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as ChargeKind)}
          className={FIELD}
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
        <p className="text-xs text-muted-foreground">
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
          <button type="button" className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })} disabled={pending} onClick={reset}>
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
      <button type="submit" className={buttonVariants({ size: "sm" })} disabled={pending}>
        {pending ? "Menyimpan…" : label}
      </button>
      <button type="button" className={buttonVariants({ variant: "ghost", size: "sm" })} disabled={pending} onClick={onCancel}>
        Batal
      </button>
    </div>
  );
}

function SummaryView({ summary, perms }: { summary: ReturnType<typeof summarizeCharges>; perms: ChargePermissions }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-border bg-muted px-4 py-3.5 text-sm"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">Total tagihan</span>
        <strong className="text-base">{formatRupiah(summary.total)}</strong>
      </div>
      {summary.unpriced > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-tone-amber-fg">
          <AlertTriangle size={12} /> {summary.unpriced} baris belum ada harga jual — total belum final.
        </p>
      )}
      {perms.canViewCost && (
        <>
          <div className="flex items-baseline justify-between gap-3 text-muted-foreground">
            <span>Total modal</span>
            <span>{formatRupiah(summary.cost)}</span>
          </div>
          {summary.uncosted > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-tone-amber-fg">
              <AlertTriangle size={12} /> {summary.uncosted} baris belum ada harga modal.
            </p>
          )}
        </>
      )}
      {perms.canViewMargin && (
        <div className="flex items-baseline justify-between gap-3">
          <span>Margin{!summary.complete && " (sementara)"}</span>
          <strong className={summary.margin < 0 ? "text-destructive" : "text-tone-green-fg"}>
            {formatRupiah(summary.margin)}
          </strong>
        </div>
      )}
    </div>
  );
}
