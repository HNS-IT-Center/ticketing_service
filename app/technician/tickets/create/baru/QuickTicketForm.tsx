"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AlertCircle, Check, History, Loader2, UserRound } from "lucide-react";
import { createTicketAction } from "@/app/actions/tickets";
import { findCustomerByPhoneAction, type KnownCustomer } from "@/app/actions/customer-lookup";
import FileUpload from "@/components/ui/FileUpload";
import UnitField, { type PickedUnit } from "@/components/catalog/UnitField";
import CatalogItemList from "@/components/catalog/CatalogItemList";
import { QuoteChecklist } from "@/components/pc-build/QuoteChecklist";
import { FormField } from "@/components/app/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useDraft, useDraftKey } from "@/lib/draft";
import { MAX_BUILD_PHOTOS, MAX_UNIT_PHOTOS } from "@/lib/attachment-kind";
import { MAX_PC_COMPONENTS, restorePickedItems, toPosted, type PickedItem } from "@/lib/catalog/picked-items";
import type { UploadedQuote } from "@/lib/pc-build-quote/parse";
import { isHandledActionError } from "@/lib/navigation-signal";
import { cn } from "@/lib/utils";

/**
 * The one-page intake form (owner, 2026-11-14), offered beside the four-step
 * wizard through a "Coba form baru" button. It posts the fields the wizard
 * posts, plus `sales_name` for a PC build, so a ticket made here is an
 * ordinary ticket.
 *
 * Order follows the counter: what is to be done, the unit, the complaint, the
 * customer (WhatsApp number first, which finds a returning customer), and who
 * handles it. One button at the end says what is still missing.
 */

type Props = {
  storeLocations: { id: string; name: string; code: string }[];
  technicians: { id: string; name: string; store_assignments: { store_id: string }[] }[];
  sales: { id: string; name: string }[];
  upgrades: { id: string; name: string }[];
  /**
   * The stores this account is placed on (Data Master → Stores). One store:
   * the ticket is that store's and nobody is asked. Several: only those are
   * offered. None (admin, sales, RMA): every store is offered.
   */
  myStores: { id: string; name: string }[];
  currentUserId: string;
  currentUserName: string;
  catalogEnabled?: boolean;
};

type TicketType = "service" | "cleaning" | "warranty_claim" | "upgrade" | "pc_build";
/** The device as staff name it, which is also the stored DeviceType. */
type DeviceGroup = "Laptop_Office" | "Laptop_Gaming" | "PC_Office" | "PC_Gaming" | "Printer" | "Other_Device";

const TYPES: { id: TicketType; label: string; hint: string }[] = [
  { id: "service", label: "Service", hint: "Perbaikan / ganti part" },
  { id: "cleaning", label: "Cleaning", hint: "Bersih & repaste" },
  { id: "warranty_claim", label: "Klaim Garansi", hint: "Unit yang dibeli di toko" },
  { id: "upgrade", label: "Upgrade", hint: "RAM, SSD, dll" },
  { id: "pc_build", label: "Rakit PC", hint: "Dari quotation" },
];

const DEVICES: { id: DeviceGroup; label: string }[] = [
  { id: "Laptop_Office", label: "Laptop Office" },
  { id: "Laptop_Gaming", label: "Laptop Gaming" },
  { id: "PC_Office", label: "PC Office" },
  { id: "PC_Gaming", label: "PC Gaming" },
  { id: "Printer", label: "Printer" },
  { id: "Other_Device", label: "Lainnya" },
];
const isLaptop = (d: DeviceGroup | "") => d === "Laptop_Office" || d === "Laptop_Gaming";
const isPc = (d: DeviceGroup | "") => d === "PC_Office" || d === "PC_Gaming";
const ACCESSORIES = ["Charger", "Tas", "Mouse", "Box", "Kabel power"];
const CONDITIONS = ["Mulus", "Lecet", "Retak", "Penyok", "Layar pecah", "Segel utuh", "Garansi aktif"];
const COMPLAINTS = ["Mati total", "Tidak bisa charge", "Layar bergaris", "Lemot", "Keyboard error", "Panas / mati sendiri", "Tidak bisa booting"];
const NO_PHONE_REASONS = ["Lewat sales", "Perusahaan, PIC belum ada", "Customer menolak"];

const CHIP =
  "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9 md:px-3";
const ON = "border-primary bg-primary/10 text-primary";
const OFF = "border-border bg-card text-foreground hover:border-primary/50";

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn(CHIP, on ? ON : OFF)}>
      {on && <Check aria-hidden="true" className="size-3.5" />}
      {children}
    </button>
  );
}

function Section({ n, title, children, id }: { n: number; title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} aria-labelledby={`sec-${n}`} className="flex scroll-mt-20 flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs md:p-5">
      <h2 id={`sec-${n}`} className="flex items-center gap-2 text-base font-semibold text-foreground">
        <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Group({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive" aria-hidden="true"> *</span>}
        {hint && <span className="font-normal text-muted-foreground"> {hint}</span>}
      </legend>
      {children}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

async function uploadTemp(files: File[]): Promise<string[] | null> {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  try {
    const res = await fetch("/api/upload-temp", { method: "POST", body: fd });
    const json = (await res.json()) as { uploaded?: { url: string }[]; error?: string };
    if (json.error) {
      toast.error(`Upload gagal: ${json.error}`);
      return null;
    }
    return (json.uploaded ?? []).map((u) => u.url);
  } catch {
    toast.error("Upload gagal. Coba lagi.");
    return null;
  }
}

export default function QuickTicketForm({
  storeLocations,
  technicians,
  sales,
  upgrades,
  myStores,
  currentUserId,
  currentUserName,
  catalogEnabled = false,
}: Props) {
  const uid = useId();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // 1. Pekerjaan
  const [ticketType, setTicketType] = useState<TicketType | "">("");
  const [device, setDevice] = useState<DeviceGroup | "">("");
  const [owner, setOwner] = useState<"customer" | "store_stock">("customer");
  const [stockOrigin, setStockOrigin] = useState("");
  const [cleaningPackage, setCleaningPackage] = useState("");
  const [selectedUpgrades, setSelectedUpgrades] = useState<string[]>([]);
  const [upgradeItems, setUpgradeItems] = useState<Record<string, PickedItem[]>>({});
  // 2. Unit
  const [deviceName, setDeviceName] = useState("");
  const [deviceCatalog, setDeviceCatalog] = useState<PickedUnit | null>(null);
  const [deviceSn, setDeviceSn] = useState("");
  const [accessories, setAccessories] = useState<string[]>([]);
  const [otherAccessory, setOtherAccessory] = useState("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [purchaseDate, setPurchaseDate] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [invoice, setInvoice] = useState<File[]>([]);
  const [invoiceUrls, setInvoiceUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  // Rakit PC
  const [quote, setQuote] = useState<UploadedQuote | null>(null);
  const [quoteChecked, setQuoteChecked] = useState<number[]>([]);
  const [pcComponents, setPcComponents] = useState<PickedItem[]>([]);
  const [buildPhotos, setBuildPhotos] = useState<File[]>([]);
  const [buildPhotoUrls, setBuildPhotoUrls] = useState<string[]>([]);
  // 3. Keluhan
  const [complaints, setComplaints] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  // 4. Pelanggan
  const [phone, setPhone] = useState("");
  const [noPhone, setNoPhone] = useState(false);
  const [noPhoneReason, setNoPhoneReason] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [known, setKnown] = useState<KnownCustomer | null>(null);
  const [knownUsed, setKnownUsed] = useState(false);
  // 5. Penanganan
  const fixedStore = myStores.length === 1 ? myStores[0] : null;
  const [storeLocationId, setStoreLocationId] = useState(fixedStore?.id ?? "");
  const [assignee, setAssignee] = useState<"me" | "other" | "none">("me");
  const [technicianId, setTechnicianId] = useState("");
  const [salesId, setSalesId] = useState("");
  // A build's sales by name: sales have no accounts here yet (owner, 2026-11-14).
  const [salesName, setSalesName] = useState("");
  const [checkFee, setCheckFee] = useState(true);
  const [pickupMethod, setPickupMethod] = useState("self_pickup");

  const [errors, setErrors] = useState<Record<string, string>>({});

  const isClaim = ticketType === "warranty_claim";
  const isStoreStock = isClaim && owner === "store_stock";
  const isBuild = ticketType === "pc_build";
  const store = storeLocations.find((s) => s.id === storeLocationId) ?? null;
  const isTechnician = technicians.some((t) => t.id === currentUserId);

  // ── Draft: the whole form, kept per account, restored on its own ──────────
  const draftData = {
    ticketType, device, owner, stockOrigin, cleaningPackage, selectedUpgrades, upgradeItems,
    deviceName, deviceCatalog, deviceSn, accessories, otherAccessory, conditions, purchaseDate,
    photoUrls, invoiceUrls, quote, pcComponents, buildPhotoUrls, complaints, notes, phone, noPhone,
    noPhoneReason, customerName, customerEmail, storeLocationId, assignee, technicianId, salesId, salesName,
    checkFee, pickupMethod,
  };
  const draft = useDraft(useDraftKey("create-ticket-v2"), draftData);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  if (draft.offer && restoredAt === null) {
    const d = draft.offer.data as typeof draftData;
    setRestoredAt(draft.offer.savedAt);
    // Drafts from before 2026-11-14 held "Laptop"/"PC"; those are asked again.
    setTicketType(d.ticketType); setDevice(DEVICES.some((x) => x.id === d.device) ? d.device : ""); setOwner(d.owner);
    setStockOrigin(d.stockOrigin); setCleaningPackage(d.cleaningPackage); setSelectedUpgrades(d.selectedUpgrades);
    setUpgradeItems(Object.fromEntries(Object.entries(d.upgradeItems ?? {}).map(([k, v]) => [k, restorePickedItems(v).slice(0, 1)])));
    setDeviceName(d.deviceName); setDeviceCatalog(d.deviceCatalog ?? null); setDeviceSn(d.deviceSn);
    setAccessories(d.accessories); setOtherAccessory(d.otherAccessory); setConditions(d.conditions);
    setPurchaseDate(d.purchaseDate); setPhotoUrls(d.photoUrls); setInvoiceUrls(d.invoiceUrls);
    setQuote(d.quote ?? null); setPcComponents(restorePickedItems(d.pcComponents)); setBuildPhotoUrls(d.buildPhotoUrls ?? []);
    setComplaints(d.complaints); setNotes(d.notes); setPhone(d.phone); setNoPhone(d.noPhone);
    setNoPhoneReason(d.noPhoneReason); setCustomerName(d.customerName); setCustomerEmail(d.customerEmail);
    setStoreLocationId(fixedStore?.id ?? d.storeLocationId ?? ""); setAssignee(d.assignee);
    setTechnicianId(d.technicianId); setSalesId(d.salesId); setSalesName(d.salesName ?? ""); setCheckFee(d.checkFee); setPickupMethod(d.pickupMethod);
  }

  // ── Returning customer, looked up from the number ─────────────────────────
  const lookupSeq = useRef(0);
  useEffect(() => {
    if (noPhone || phone.length < 9) return;
    const seq = ++lookupSeq.current;
    const t = setTimeout(async () => {
      try {
        const found = await findCustomerByPhoneAction(phone);
        if (seq === lookupSeq.current) setKnown(found);
      } catch {
        /* a failed lookup only means no suggestion */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [phone, noPhone]);
  const suggestion = !noPhone && phone.length >= 9 && known && !knownUsed ? known : null;

  // ── Choices that narrow other choices ─────────────────────────────────────
  const pickType = (t: TicketType) => {
    setTicketType(t);
    if (t === "pc_build") {
      setDevice("PC_Office");
      setNoPhone(false);
    }
    if (t !== "warranty_claim") setOwner("customer");
    if (t !== "pc_build" && pickupMethod === "courier") setPickupMethod("self_pickup");
  };
  const deviceAllowed = (d: DeviceGroup) => {
    if (ticketType === "upgrade") return isLaptop(d) || isPc(d);
    return true;
  };
  const pickComplaint = (c: string) => {
    const on = complaints.includes(c);
    setComplaints(toggle(complaints, c));
    if (!on && !notes.toLowerCase().includes(c.toLowerCase())) setNotes((n) => (n.trim() ? `${n.trim().replace(/[.,]$/, "")}, ${c}` : c));
  };

  const finalDeviceType = (): string => {
    if (isBuild) return "PC_Office";
    return device || "Other_Device";
  };

  const onUpload = (setFiles: (f: File[]) => void, setUrls: (u: string[]) => void) => async (picked: File[]) => {
    setFiles(picked);
    if (picked.length === 0) return setUrls([]);
    setUploading((n) => n + 1);
    const urls = await uploadTemp(picked);
    if (urls) setUrls(urls);
    setUploading((n) => n - 1);
  };

  // ── What is still missing, in the order of the page ───────────────────────
  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!ticketType) e.ticketType = "Pilih jenis pekerjaan.";
    if (ticketType && !isBuild && !device) e.device = "Pilih perangkat.";
    if (ticketType === "cleaning" && !cleaningPackage) e.cleaningPackage = "Pilih paket cleaning.";
    if (ticketType === "upgrade" && selectedUpgrades.length === 0) e.upgrades = "Pilih minimal satu upgrade.";
    if (isStoreStock && !stockOrigin.trim()) e.stockOrigin = "Asal stok wajib diisi.";
    if (isClaim && !deviceSn.trim()) e.deviceSn = "SN wajib untuk klaim garansi.";
    if (isClaim && !isStoreStock && !purchaseDate) e.purchaseDate = "Tanggal pembelian wajib untuk klaim garansi.";
    if (isBuild && quote) {
      if (quoteChecked.length !== quote.items.length) e.quote = "Centang setiap komponen yang sesuai dengan barang yang dibawa.";
      if (buildPhotoUrls.length === 0) e.buildPhotos = "Lampirkan foto komponen rakitan.";
    }
    if ((ticketType === "service" || isClaim) && !notes.trim()) e.notes = "Tulis keluhan customer.";
    // A PC build is answered for by its sales; the customer is optional
    // (owner, 2026-11-14). Sales is required only while there is a Sales
    // account to pick — production has none yet, and a build must not be
    // blocked by that.
    if (isBuild) {
      if (!salesName.trim()) e.sales = "Tulis nama sales yang menjual rakitan ini.";
      if (phone && !/^\d{9,13}$/.test(phone)) e.phone = "Nomor WhatsApp 9–13 angka, tanpa 0 di depan.";
      if (customerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) e.customerEmail = "Email tidak valid.";
    } else if (!isStoreStock) {
      if (!customerName.trim()) e.customerName = "Nama pelanggan wajib diisi.";
      if (noPhone) {
        if (isClaim) e.phone = "Klaim garansi wajib punya nomor customer.";
        else if (!noPhoneReason) e.phone = "Pilih alasan tidak ada nomor.";
      } else if (!/^\d{9,13}$/.test(phone)) e.phone = "Nomor WhatsApp 9–13 angka, tanpa 0 di depan.";
      else if (/^8?0+$/.test(phone)) e.phone = "Nomor ini bukan nomor sungguhan.";
      if (customerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) e.customerEmail = "Email tidak valid.";
    }
    if (!storeLocationId) e.store = "Pilih toko.";
    if (assignee === "other" && !technicianId) e.technician = "Pilih teknisi.";
    if (uploading > 0) e.uploading = "Tunggu upload selesai.";
    return e;
  };
  const missing = validate();
  const missingLabels = Object.values(missing);
  const ready = missingLabels.length === 0;

  const submit = () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error(Object.values(e)[0]);
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.append("store_location_id", storeLocationId);
      const techId = assignee === "me" && isTechnician ? currentUserId : assignee === "other" ? technicianId : "";
      if (techId) fd.append("technician_id", techId);
      if (salesId && !isBuild) fd.append("sales_id", salesId);
      if (isBuild && salesName.trim()) fd.append("sales_name", salesName.trim());
      fd.append("customer_type", "User");
      fd.append("unit_ownership", isStoreStock ? "store_stock" : "customer");
      if (isStoreStock) fd.append("stock_origin", stockOrigin.trim());
      else {
        if (customerName.trim()) fd.append("customer_name", customerName.trim());
        if (customerEmail.trim()) fd.append("customer_email", customerEmail.trim());
        if (!noPhone && phone) fd.append("phone", `+62${phone}`);
      }
      fd.append("ticket_type", ticketType);
      fd.append("device_type", finalDeviceType());
      fd.append("pickup_method", pickupMethod);
      if (deviceName) fd.append("device_name", deviceName);
      if (deviceCatalog) fd.append("device_catalog_item_id", String(deviceCatalog.id));
      if (deviceSn.trim()) fd.append("device_sn", deviceSn.trim());
      if (isClaim && purchaseDate) fd.append("purchase_date", purchaseDate);
      if (isBuild) {
        fd.append("pc_components_json", JSON.stringify(pcComponents.map(toPosted)));
        if (quote) {
          fd.append("quote_url", quote.url);
          fd.append("quote_checked_count", String(quoteChecked.length));
          buildPhotoUrls.forEach((u) => fd.append("build_photo_urls", u));
        }
      }
      if (conditions.length) fd.append("device_condition", conditions.join(", "));
      const acc = [...accessories, ...(otherAccessory.trim() ? [otherAccessory.trim()] : [])];
      if (acc.length) fd.append("accessories", acc.join(", "));
      // Trial: there is no column for the reason yet, so it rides on the notes.
      const noteText = [notes.trim(), noPhone && !isStoreStock ? `Kontak: tanpa nomor WhatsApp (${noPhoneReason}).` : ""].filter(Boolean).join("\n");
      if (noteText) fd.append("notes", noteText);
      if (ticketType === "service" && checkFee) fd.append("is_overnight_check", "1");
      if (ticketType === "cleaning" && cleaningPackage) fd.append("service_package", cleaningPackage);
      if (ticketType === "upgrade") {
        fd.append(
          "upgrade_selections_json",
          JSON.stringify(selectedUpgrades.map((id) => {
            const item = upgradeItems[id]?.at(0);
            return { upgradeId: id, item: item ? toPosted(item) : null };
          })),
        );
      }
      // The claim's invoice and photos keep their kinds; everything else is a plain attachment.
      if (isClaim) {
        if (!isStoreStock) invoiceUrls.forEach((u) => fd.append("preuploaded_urls", u));
        photoUrls.forEach((u) => fd.append("unit_photo_urls", u));
      } else {
        photoUrls.forEach((u) => fd.append("preuploaded_urls", u));
      }
      fd.append("is_for_self", "0");

      try {
        const result = (await createTicketAction(fd)) as { error?: string; redirectUrl?: string } | undefined;
        if (result?.error) {
          toast.error(result.error);
          setErrors({ submit: result.error });
        } else if (result?.redirectUrl) {
          draft.finish();
          toast.success("Tiket dibuat.");
          router.push(result.redirectUrl);
        }
      } catch (err) {
        if (isHandledActionError(err)) return;
        const msg = err instanceof Error ? err.message : "Terjadi kesalahan.";
        toast.error(msg);
        setErrors({ submit: msg });
      }
    });
  };

  const typeLabel = TYPES.find((t) => t.id === ticketType)?.label;
  const showErr = (k: string) => errors[k] ?? undefined;

  const summary = (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Pekerjaan</dt>
        <dd className="font-medium">{typeLabel ? `${typeLabel}${device && !isBuild ? ` · ${DEVICES.find((x) => x.id === device)?.label}` : ""}${isStoreStock ? " · stok toko" : ""}` : "—"}</dd>
        {isBuild ? (
          <>
            <dt className="text-muted-foreground">Komponen</dt>
            <dd className="font-medium">{quote ? `${quote.items.length} dari quotation` : pcComponents.length ? `${pcComponents.length} komponen` : "—"}</dd>
          </>
        ) : (
          <>
            <dt className="text-muted-foreground">Unit</dt>
            <dd className="font-medium [overflow-wrap:anywhere]">{deviceCatalog?.name ?? (deviceName || "—")}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{isBuild ? "Catatan" : "Keluhan"}</dt>
        <dd className="line-clamp-2 font-medium">{notes.trim() || "—"}</dd>
        {isBuild && (
          <>
            <dt className="text-muted-foreground">Sales</dt>
            <dd className="font-medium">{salesName.trim() || "—"}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Pelanggan</dt>
        <dd className="font-medium">{isStoreStock ? "Stok toko" : customerName.trim() ? `${customerName.trim()}${noPhone ? " · tanpa nomor" : phone ? ` · +62${phone}` : ""}` : "—"}</dd>
      </dl>
      <p className={cn("text-sm font-medium", ready ? "text-tone-green-fg" : "text-tone-amber-fg")}>
        {ready ? "Semua yang wajib sudah terisi." : `Belum lengkap: ${missingLabels.slice(0, 2).join(" ")}${missingLabels.length > 2 ? ` (+${missingLabels.length - 2})` : ""}`}
      </p>
      <Button type="button" size="lg" onClick={submit} disabled={isPending} className="h-12 w-full text-base">
        {isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
        Buat Tiket
      </Button>
    </div>
  );

  return (
    <div data-slot="quick-ticket-form" className="flex flex-col gap-4 pb-56 lg:pb-0">
      {restoredAt !== null && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <History aria-hidden="true" className="size-4" />
          Isian sebelumnya dipulihkan.
          <button type="button" onClick={() => { draft.discard(); window.location.reload(); }} className="min-h-11 text-primary underline md:min-h-0">
            Kosongkan
          </button>
        </p>
      )}
      {errors.submit && (
        <p role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle aria-hidden="true" className="size-4 shrink-0" /> {errors.submit}
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Left: the work, the unit, the complaint */}
        <div className="flex min-w-0 flex-col gap-4">
          <Section n={1} title="Mau dikerjakan apa?">
            <Group label="Jenis pekerjaan" required error={showErr("ticketType")}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                {TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={ticketType === t.id}
                    onClick={() => pickType(t.id)}
                    className={cn(
                      "flex min-h-16 cursor-pointer flex-col items-start justify-center gap-0.5 rounded-lg border px-3 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      ticketType === t.id ? "border-2 border-primary bg-primary/10 text-primary" : "border-border bg-card hover:border-primary/50",
                    )}
                  >
                    <span className="text-sm font-semibold">{t.label}</span>
                    <span className="text-xs opacity-80">{t.hint}</span>
                  </button>
                ))}
              </div>
            </Group>

            {ticketType && !isBuild && (
              <Group label="Perangkat" required error={showErr("device")}>
                <div className="flex flex-wrap gap-2">
                  {DEVICES.filter((d) => deviceAllowed(d.id)).map((d) => (
                    <Chip key={d.id} on={device === d.id} onClick={() => setDevice(d.id)}>
                      {d.label}
                    </Chip>
                  ))}
                </div>
              </Group>
            )}

            {isClaim && (
              <Group label="Unit milik" required>
                <div className="flex flex-wrap gap-2">
                  <Chip on={owner === "customer"} onClick={() => setOwner("customer")}>Customer</Chip>
                  <Chip on={owner === "store_stock"} onClick={() => setOwner("store_stock")}>Stok toko</Chip>
                </div>
              </Group>
            )}

            {ticketType === "cleaning" && (
              <FormField label="Paket cleaning" htmlFor={`${uid}-pkg`} required error={showErr("cleaningPackage")}>
                <NativeSelect id={`${uid}-pkg`} value={cleaningPackage} onChange={(e) => setCleaningPackage(e.target.value)}>
                  <option value="">Pilih paket</option>
                  <option value="Basic_Cleaning">Basic Cleaning</option>
                  {(isLaptop(device) || isPc(device)) && <option value="Full_Repaste">Full Cleaning + Repaste</option>}
                  {isPc(device) && <option value="Full_Repaste_CPU_GPU">Full Cleaning + Repaste CPU &amp; GPU</option>}
                </NativeSelect>
              </FormField>
            )}

            {ticketType === "upgrade" && (
              <Group label="Upgrade" required error={showErr("upgrades")}>
                <div className="flex flex-wrap gap-2">
                  {upgrades
                    .filter((u) => !isLaptop(device) || u.name.includes("RAM") || u.name.includes("SSD"))
                    .map((u) => (
                      <Chip key={u.id} on={selectedUpgrades.includes(u.id)} onClick={() => setSelectedUpgrades(toggle(selectedUpgrades, u.id))}>
                        {u.name}
                      </Chip>
                    ))}
                </div>
                {upgrades
                  .filter((u) => selectedUpgrades.includes(u.id))
                  .map((u) => (
                    <div key={u.id} className="flex flex-col gap-1.5">
                      <span className="text-sm text-muted-foreground">Barang untuk {u.name} (opsional)</span>
                      <CatalogItemList
                        items={upgradeItems[u.id] ?? []}
                        onChange={(items) => setUpgradeItems((p) => ({ ...p, [u.id]: items }))}
                        catalogEnabled={catalogEnabled}
                        max={1}
                        store={store}
                        searchPlaceholder="Cari barang, mis. ram ddr4 8gb"
                        manualPlaceholder="Nama barang"
                      />
                    </div>
                  ))}
              </Group>
            )}

            {isBuild && (
              <div className="flex flex-col gap-4">
                <Group label="Quotation" hint="(bila ada)" error={showErr("quote")}>
                  <QuoteChecklist
                    quote={quote}
                    onQuoteChange={(q) => {
                      setQuote(q);
                      if (q?.salesName && !salesName.trim()) setSalesName(q.salesName);
                      if (q?.customer && !customerName.trim()) setCustomerName(q.customer);
                    }}
                    checked={quoteChecked}
                    onCheckedChange={setQuoteChecked}
                  />
                </Group>
                <Group label={quote ? "Komponen tambahan" : "Komponen PC"} hint="(opsional)">
                  <CatalogItemList
                    items={pcComponents}
                    onChange={setPcComponents}
                    catalogEnabled={catalogEnabled}
                    max={MAX_PC_COMPONENTS}
                    store={store}
                    searchPlaceholder="Cari komponen, mis. rtx 4060"
                    manualPlaceholder="Nama komponen"
                    addAnotherLabel="Tambah komponen"
                  />
                </Group>
                {!quote && (
                  <Group label="Foto / lampiran" hint="(opsional: referensi, daftar rakitan)">
                    <FileUpload value={photos} onChange={onUpload(setPhotos, setPhotoUrls)} maxFiles={5} />
                    {photos.length === 0 && photoUrls.length > 0 && <p className="text-xs text-muted-foreground">{photoUrls.length} file dari draf sudah terunggah.</p>}
                  </Group>
                )}
                {quote && (
                  <Group label="Foto komponen yang dibawa" required hint={`(maks ${MAX_BUILD_PHOTOS})`} error={showErr("buildPhotos")}>
                    <FileUpload value={buildPhotos} onChange={onUpload(setBuildPhotos, setBuildPhotoUrls)} maxFiles={MAX_BUILD_PHOTOS} accept="image/*,image/heic,image/heif" />
                    {buildPhotos.length === 0 && buildPhotoUrls.length > 0 && <p className="text-xs text-muted-foreground">{buildPhotoUrls.length} foto dari draf sudah terunggah.</p>}
                  </Group>
                )}
              </div>
            )}
          </Section>

          {!isBuild && (
            <Section n={2} title="Unitnya">
              <UnitField
                catalogEnabled={catalogEnabled}
                unit={deviceCatalog}
                onUnitChange={setDeviceCatalog}
                name={deviceName}
                onNameChange={setDeviceName}
                label="Nama unit"
              />
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <FormField label="Serial number" htmlFor={`${uid}-sn`} required={isClaim} hint={isClaim ? undefined : "(opsional)"} error={showErr("deviceSn")}>
                  <Input id={`${uid}-sn`} value={deviceSn} onChange={(e) => setDeviceSn(e.target.value)} placeholder="Ketik dari label SN" className="bg-card" />
                </FormField>
                {isClaim && (
                  <FormField label="Tanggal pembelian" htmlFor={`${uid}-buy`} required={!isStoreStock} hint={isStoreStock ? "(opsional)" : undefined} error={showErr("purchaseDate")}>
                    <Input id={`${uid}-buy`} type="date" value={purchaseDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setPurchaseDate(e.target.value)} className="bg-card" />
                  </FormField>
                )}
              </div>
              <Group label="Kelengkapan yang dibawa">
                <div className="flex flex-wrap gap-2">
                  {ACCESSORIES.map((a) => (
                    <Chip key={a} on={accessories.includes(a)} onClick={() => setAccessories(toggle(accessories, a))}>{a}</Chip>
                  ))}
                </div>
                <Input value={otherAccessory} onChange={(e) => setOtherAccessory(e.target.value)} placeholder="Lainnya, mis. stylus" aria-label="Kelengkapan lain" className="bg-card" />
              </Group>
              <Group label="Kondisi fisik">
                <div className="flex flex-wrap gap-2">
                  {CONDITIONS.map((c) => (
                    <Chip key={c} on={conditions.includes(c)} onClick={() => setConditions(toggle(conditions, c))}>{c}</Chip>
                  ))}
                </div>
              </Group>
              <Group label="Foto unit saat diterima" hint={`(depan, belakang, label SN · maks ${MAX_UNIT_PHOTOS})`}>
                <FileUpload value={photos} onChange={onUpload(setPhotos, setPhotoUrls)} maxFiles={MAX_UNIT_PHOTOS} />
                {photos.length === 0 && photoUrls.length > 0 && <p className="text-xs text-muted-foreground">{photoUrls.length} foto dari draf sudah terunggah.</p>}
              </Group>
              {/* A customer's unit needs the customer's receipt before it can go
                  to RMA (the handover refuses it); a store-stock unit's purchase
                  invoice is the RMA desk's to attach, not the technician's. */}
              {isClaim && !isStoreStock && (
                <Group label="Nota pembelian" hint="(wajib — boleh menyusul, tapi tiket belum bisa diserahkan ke RMA sebelum nota ada)">
                  <FileUpload value={invoice} onChange={onUpload(setInvoice, setInvoiceUrls)} maxFiles={3} />
                  {invoice.length === 0 && invoiceUrls.length > 0 && <p className="text-xs text-muted-foreground">{invoiceUrls.length} file dari draf sudah terunggah.</p>}
                </Group>
              )}
              {isStoreStock && <p className="text-sm text-muted-foreground">Nota pembelian unit stok toko diisi oleh meja RMA.</p>}
            </Section>
          )}

          <Section n={3} title={isBuild ? "Catatan rakitan" : "Keluhan customer"}>
            {!isBuild && (
              <div role="group" aria-label="Keluhan cepat" className="flex flex-wrap gap-2">
                {COMPLAINTS.map((c) => (
                  <Chip key={c} on={complaints.includes(c)} onClick={() => pickComplaint(c)}>{c}</Chip>
                ))}
              </div>
            )}
            <FormField
              label={isBuild ? "Catatan" : "Cerita customer"}
              htmlFor={`${uid}-notes`}
              required={ticketType === "service" || isClaim}
              hint={ticketType === "service" || isClaim ? undefined : "(opsional)"}
              help={isBuild ? undefined : "Ketuk keluhan di atas untuk mengisi cepat, lalu tambahkan detailnya."}
              error={showErr("notes")}
            >
              <Textarea id={`${uid}-notes`} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="resize-y bg-card" />
            </FormField>
          </Section>
        </div>

        {/* Right: who it is for, who does it, and the button */}
        <div className="flex min-w-0 flex-col gap-4">
          <Section n={4} title={isBuild ? "Sales & pelanggan" : "Pelanggan"}>
            {isBuild && (
              <FormField
                label="Nama sales"
                htmlFor={`${uid}-sales`}
                required
                help="Sales yang menjual rakitan ini. Terisi sendiri dari quotation bila ada."
                error={showErr("sales")}
              >
                <Input id={`${uid}-sales`} value={salesName} onChange={(e) => setSalesName(e.target.value)} placeholder="Nama sales" autoComplete="off" className="bg-card" />
              </FormField>
            )}
            {isBuild && <p className="text-sm text-muted-foreground">Data pelanggan di bawah ini opsional untuk rakitan.</p>}
            {isStoreStock ? (
              <>
                <p className="rounded-lg bg-tone-blue-bg p-3 text-sm text-tone-blue-fg">Unit stok toko: tidak perlu data pelanggan.</p>
                <FormField label="Asal stok" htmlFor={`${uid}-origin`} required error={showErr("stockOrigin")}>
                  <Input id={`${uid}-origin`} value={stockOrigin} onChange={(e) => setStockOrigin(e.target.value)} placeholder="Mis. Gudang Nagoya rak B3" className="bg-card" />
                </FormField>
              </>
            ) : (
              <>
                {!noPhone && (
                  <FormField label="Nomor WhatsApp" htmlFor={`${uid}-phone`} required={!isBuild} hint={isBuild ? "(opsional)" : undefined} help="Isi dulu: pelanggan lama terisi sendiri." error={showErr("phone")}>
                    <div className="flex h-11 overflow-hidden rounded-lg border border-input bg-card focus-within:ring-3 focus-within:ring-ring/50 md:h-10">
                      <span className="flex items-center bg-muted px-3 text-sm font-semibold text-muted-foreground">+62</span>
                      <input
                        id={`${uid}-phone`}
                        type="tel"
                        inputMode="numeric"
                        value={phone}
                        onChange={(e) => {
                          setPhone(e.target.value.replace(/\D/g, "").replace(/^0+/, "").replace(/^62/, "").slice(0, 13));
                          setKnownUsed(false);
                        }}
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="812 3456 7890"
                        className="min-w-0 flex-1 bg-transparent px-3 text-base outline-none"
                      />
                    </div>
                  </FormField>
                )}
                {suggestion && (
                  <button
                    type="button"
                    onClick={() => { setCustomerName(suggestion.name); setKnownUsed(true); }}
                    className="flex items-center gap-3 rounded-lg border border-primary bg-primary/5 p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <UserRound aria-hidden="true" className="size-8 shrink-0 rounded-full bg-primary p-1.5 text-primary-foreground" />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-semibold">Pelanggan lama: {suggestion.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {suggestion.tickets} tiket · terakhir {new Date(suggestion.lastAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} · ketuk untuk memakai
                      </span>
                    </span>
                  </button>
                )}
                {knownUsed && <p className="text-sm text-tone-green-fg">Nama diisi dari tiket sebelumnya.</p>}
                {noPhone && (
                  <Group label="Kenapa tidak ada nomor?" required error={showErr("phone")}>
                    <div className="flex flex-wrap gap-2">
                      {NO_PHONE_REASONS.map((r) => (
                        <Chip key={r} on={noPhoneReason === r} onClick={() => setNoPhoneReason(r)}>{r}</Chip>
                      ))}
                    </div>
                  </Group>
                )}
                {!isBuild && <button
                  type="button"
                  onClick={() => { setNoPhone(!noPhone); setNoPhoneReason(""); setKnownUsed(false); }}
                  className="min-h-11 self-start text-sm font-semibold text-primary underline-offset-2 hover:underline md:min-h-0"
                >
                  {noPhone ? "Ada nomor WhatsApp" : "Customer tidak memberi nomor?"}
                </button>}
                <FormField label="Nama pelanggan" htmlFor={`${uid}-name`} required={!isBuild} hint={isBuild ? "(opsional)" : undefined} error={showErr("customerName")}>
                  <Input id={`${uid}-name`} value={customerName} onChange={(e) => { setCustomerName(e.target.value); setKnownUsed(false); }} placeholder="Nama customer" className="bg-card" />
                </FormField>
                {showEmail || customerEmail ? (
                  <FormField label="Email" htmlFor={`${uid}-email`} hint="(opsional)" error={showErr("customerEmail")}>
                    <Input id={`${uid}-email`} type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="bg-card" />
                  </FormField>
                ) : (
                  <button type="button" onClick={() => setShowEmail(true)} className="min-h-11 self-start text-sm font-semibold text-primary md:min-h-0">
                    + Tambah email
                  </button>
                )}
              </>
            )}
          </Section>

          <Section n={5} title="Penanganan">
            {fixedStore ? (
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="text-muted-foreground">Toko</span>
                <span className="font-semibold text-foreground">{fixedStore.name}</span>
                <span className="text-xs text-muted-foreground">(sesuai akun)</span>
              </p>
            ) : myStores.length > 1 ? (
              <Group label="Toko" required error={showErr("store")}>
                <div className="flex flex-wrap gap-2">
                  {myStores.map((s) => (
                    <Chip key={s.id} on={storeLocationId === s.id} onClick={() => setStoreLocationId(s.id)}>{s.name}</Chip>
                  ))}
                </div>
              </Group>
            ) : (
              <FormField label="Toko" htmlFor={`${uid}-store`} required help="Akun ini belum terdaftar di toko mana pun." error={showErr("store")}>
                <NativeSelect id={`${uid}-store`} value={storeLocationId} onChange={(e) => setStoreLocationId(e.target.value)}>
                  <option value="">Pilih toko</option>
                  {storeLocations.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </NativeSelect>
              </FormField>
            )}
            <Group label="Dikerjakan oleh" error={showErr("technician")}>
              <div className="flex flex-wrap gap-2">
                {isTechnician && <Chip on={assignee === "me"} onClick={() => setAssignee("me")}>Saya sendiri ({currentUserName.split(" ")[0]})</Chip>}
                <Chip on={assignee === "other"} onClick={() => setAssignee("other")}>Teknisi lain</Chip>
                <Chip on={assignee === "none"} onClick={() => setAssignee("none")}>Belum ditentukan</Chip>
              </div>
              {assignee === "other" && (
                <NativeSelect value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} aria-label="Teknisi">
                  <option value="">Pilih teknisi</option>
                  {technicians
                    .filter((t) => t.id !== currentUserId && (!storeLocationId || t.store_assignments.some((a) => a.store_id === storeLocationId)))
                    .map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                </NativeSelect>
              )}
            </Group>
            {!isBuild && salesId && (
              <FormField label="Sales" htmlFor={`${uid}-sales`} hint="(opsional)">
                <NativeSelect id={`${uid}-sales`} value={salesId} onChange={(e) => setSalesId(e.target.value)}>
                  <option value="">Tanpa sales</option>
                  {sales.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </NativeSelect>
              </FormField>
            )}
            {ticketType === "service" && (
              <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-border p-3">
                <input type="checkbox" checked={checkFee} onChange={(e) => setCheckFee(e.target.checked)} className="size-5 shrink-0 accent-primary" />
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">Biaya cek Rp 50.000</span>
                  <span className="text-xs text-muted-foreground">Masuk ke Rincian Biaya, bisa dihapus nanti</span>
                </span>
              </label>
            )}
            <Group label="Diambil dengan">
              <div className="flex flex-wrap gap-2">
                <Chip on={pickupMethod === "self_pickup"} onClick={() => setPickupMethod("self_pickup")}>Diambil sendiri</Chip>
                {isBuild && <Chip on={pickupMethod === "courier"} onClick={() => setPickupMethod("courier")}>Kurir</Chip>}
              </div>
            </Group>
          </Section>

          {/* From lg: the summary stays in view beside the form. */}
          <section aria-label="Ringkasan" className="sticky top-20 hidden flex-col gap-3 rounded-xl border-2 border-primary bg-card p-5 lg:flex">
            <h2 className="text-base font-semibold">Ringkasan</h2>
            {summary}
          </section>
        </div>
      </div>

      {/* Below lg: the same summary pinned to the bottom of the screen. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card p-4 shadow-[0_-6px_20px_rgba(0,0,0,0.08)] lg:hidden">
        <div className="mx-auto flex max-w-xl flex-col gap-2">
          <p className={cn("text-sm font-medium", ready ? "text-tone-green-fg" : "text-tone-amber-fg")}>
            {ready ? "Semua yang wajib sudah terisi." : `Belum lengkap: ${missingLabels[0]}${missingLabels.length > 1 ? ` (+${missingLabels.length - 1})` : ""}`}
          </p>
          <Button type="button" size="lg" onClick={submit} disabled={isPending} className="h-12 w-full text-base">
            {isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            Buat Tiket
          </Button>
        </div>
      </div>
    </div>
  );
}
