"use client";

import { useId, useState, useTransition } from "react";
import { createTicketAction } from "@/app/actions/tickets";
import { AlertCircle, ChevronLeft, ChevronRight, Check, History, Laptop, Loader2, Monitor, Printer, Settings, Cpu } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import FileUpload from "@/components/ui/FileUpload";
import { useDraft, useDraftKey } from "@/lib/draft";
import { MAX_BUILD_PHOTOS, MAX_UNIT_PHOTOS } from "@/lib/attachment-kind";
import { QuoteChecklist } from "@/components/pc-build/QuoteChecklist";
import type { UploadedQuote } from "@/lib/pc-build-quote/parse";
import { normalizeName } from "@/lib/pc-build-quote/sales";
import UnitField, { type PickedUnit } from "@/components/catalog/UnitField";
import CatalogItemList from "@/components/catalog/CatalogItemList";
import { MAX_PC_COMPONENTS, restorePickedItems, toPosted, type PickedItem } from "@/lib/catalog/picked-items";
import { FormField } from "@/components/app/FormField";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { isNavigationSignal } from "@/lib/navigation-signal";

type Props = {
  storeLocations: { id: string; name: string; code: string }[];
  technicians: { id: string; name: string; store_assignments: { store_id: string }[] }[];
  sales: { id: string; name: string }[];
  upgrades: { id: string; name: string }[];
  defaultStoreLocationId?: string;
  /** Whether the Accurate catalogue is reachable; without it the unit is typed. */
  catalogEnabled?: boolean;
};

const STEPS = ["Intake & Assign", "Choose Device", "Service Details", "Confirm"];

const DEVICES = [
  { id: "Laptop", icon: Laptop, label: "Laptop" },
  { id: "Computer", icon: Monitor, label: "Computer" },
  { id: "Printer", icon: Printer, label: "Printer" },
  { id: "Others", icon: Settings, label: "Others" },
  { id: "Build PC", icon: Cpu, label: "Build PC" },
];

/** A text button that reads as a link, sized for a thumb on a phone. */
const LINK_BUTTON =
  "inline-flex min-h-11 cursor-pointer items-center rounded-sm text-primary underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-0";

/** A pill toggle: the case chips and the upgrade chips. */
const CHIP =
  "inline-flex cursor-pointer items-center rounded-full border text-[0.8125rem] font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const CHIP_ON = "border-primary bg-primary text-primary-foreground shadow-sm";
const CHIP_OFF = "border-border bg-card text-foreground hover:border-primary hover:text-primary";

const CHECK_LABEL = "inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground md:min-h-0";
const CHECKBOX = "size-[1.1rem] shrink-0 accent-primary";

/**
 * Where the wizard is. A phone gets one line and a bar ("Langkah 2 dari 4"),
 * which fits at 360px; from md up, the four numbered steps with their names.
 */
function Stepper({ step }: { step: number }) {
  return (
    <nav aria-label="Langkah pembuatan tiket">
      <div className="flex flex-col gap-2 md:hidden">
        <p className="text-sm text-muted-foreground">
          Langkah {step} dari {STEPS.length} ·{" "}
          <span className="font-semibold text-foreground">{STEPS[step - 1]}</span>
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${(step / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <ol className="hidden md:flex">
        {STEPS.map((label, i) => {
          const num = i + 1;
          const done = step > num;
          const active = step === num;
          return (
            <li
              key={label}
              aria-current={active ? "step" : undefined}
              className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
            >
              <div className="flex w-full items-center">
                <div className={cn("h-0.5 flex-1", i === 0 ? "invisible" : done || active ? "bg-primary" : "bg-border")} />
                <div
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors",
                    done || active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  {done ? <Check aria-hidden="true" className="size-4" /> : num}
                  {done && <span className="sr-only">{num} (selesai)</span>}
                </div>
                <div className={cn("h-0.5 flex-1", i === STEPS.length - 1 ? "invisible" : done ? "bg-primary" : "bg-border")} />
              </div>
              <span
                className={cn(
                  "px-1 text-center text-xs leading-snug",
                  active ? "font-semibold text-primary" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** A labelled block for a control with no single input to point at (a file picker, a chip group). */
function FieldGroup({
  label,
  required,
  hint,
  help,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  help?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">
        {label}
        {required && <span aria-hidden="true"> *</span>}
        {hint && <span className="font-normal text-muted-foreground"> {hint}</span>}
      </span>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      {children}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** A set of checkboxes under one name. */
function CheckGroup({
  legend,
  hint,
  after,
  children,
}: {
  legend: string;
  hint?: string;
  after?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium text-foreground">
        {legend}
        {hint && <span className="font-normal text-muted-foreground"> {hint}</span>}
      </legend>
      <div className="flex flex-wrap gap-x-5 gap-y-1">{children}</div>
      {after && <div className="mt-1.5">{after}</div>}
    </fieldset>
  );
}

function Uploading({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[0.8125rem] text-primary">
      <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
      {children}
    </p>
  );
}

export default function CreateTicketForm({ storeLocations, technicians, sales, upgrades, defaultStoreLocationId, catalogEnabled = false }: Props) {
  const [step, setStep] = useState(1);
  const uid = useId();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Step 1: Intake & Assign
  const [storeLocationId, setStoreLocationId] = useState(defaultStoreLocationId || "");
  const [technicianId, setTechnicianId] = useState("");
  const [salesId, setSalesId] = useState("");
  // Asked first, because at the counter it is already known. A store-stock
  // unit has no customer, so choosing it removes the customer fields entirely
  // and narrows the ticket to a warranty claim — the only reason stock comes in.
  const [unitOwnership, setUnitOwnership] = useState<"customer" | "store_stock">("customer");
  const isStoreStock = unitOwnership === "store_stock";
  const [stockOrigin, setStockOrigin] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneFocused, setPhoneFocused] = useState(false);

  // Step 2: Choose Device
  const [gridDevice, setGridDevice] = useState("");

  // Step 3: Service Details (Case)
  // No default: the case must be chosen explicitly. Pre-selecting "service"
  // silently produced service tickets whenever someone did not notice the
  // chips, which made warranty claims practically unreachable.
  const [ticketType, setTicketType] = useState("");
  const [deviceType, setDeviceType] = useState(""); // actual Prisma enum: Laptop_Office, PC_Office, etc.
  const [deviceName, setDeviceName] = useState(""); // "Device Type (Optional)" in user terms
  // The unit as picked from the Accurate catalogue; null when typed.
  const [deviceCatalog, setDeviceCatalog] = useState<PickedUnit | null>(null);
  const [deviceSn, setDeviceSn] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [conditions, setConditions] = useState<string[]>([]); // Garansi Aktif, Garansi Habis, Segel Utuh, Fisik Mulus
  const [selectedAccessories, setSelectedAccessories] = useState<string[]>([]);
  const [customAccessory, setCustomAccessory] = useState("");
  const [notes, setNotes] = useState("");
  const [checkDiagnosisFee, setCheckDiagnosisFee] = useState(true); // Default true for Service
  const [cleaningPackage, setCleaningPackage] = useState(""); // Basic_Cleaning, Full_Repaste, Full_Repaste_CPU_GPU
  const [selectedUpgrades, setSelectedUpgrades] = useState<string[]>([]);
  // Step 3 file attachments — stored as R2 temp URLs immediately after upload
  // This avoids keeping File objects in state across step navigation (causes hydration issues)
  const [uploadedFileUrls, setUploadedFileUrls] = useState<string[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  // Warranty claim: photos of the unit as it arrived, kept apart from the invoice.
  const [unitPhotos, setUnitPhotos] = useState<File[]>([]);
  const [unitPhotoUrls, setUnitPhotoUrls] = useState<string[]>([]);
  const [isUploadingUnitPhotos, setIsUploadingUnitPhotos] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  // PC build components and the item fitted for each chosen upgrade, picked
  // from the Accurate catalogue or typed. An upgrade holds at most one item.
  const [pcComponents, setPcComponents] = useState<PickedItem[]>([]);
  const [upgradeItems, setUpgradeItems] = useState<Record<string, PickedItem[]>>({});
  // A PC build opened from its e-commerce quotation: the PDF as read, which of
  // its lines were ticked as matching what was brought in, and photos of the
  // components. The ticks are not drafted — after a reload they are given again.
  const [quote, setQuote] = useState<UploadedQuote | null>(null);
  const [quoteChecked, setQuoteChecked] = useState<number[]>([]);
  const [buildPhotos, setBuildPhotos] = useState<File[]>([]);
  const [buildPhotoUrls, setBuildPhotoUrls] = useState<string[]>([]);
  const [isUploadingBuildPhotos, setIsUploadingBuildPhotos] = useState(false);

  // Keep overnight/pickup in case needed later, or default
  const [pickupMethod, setPickupMethod] = useState("self_pickup");
  const [isOvernight, setIsOvernight] = useState(false);

  // Step 4: Confirm
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Everything typed so far, kept in the browser so a reload — Android
  // discarding the tab while the camera is open, a dropped signal — does not
  // cost the whole intake. Files are kept as their already-uploaded URLs; the
  // confirmation tick is deliberately not kept, it must be given again.
  const draftData = {
    step, storeLocationId, technicianId, salesId, unitOwnership, stockOrigin,
    customerName, customerEmail, phone, gridDevice, ticketType, deviceType,
    deviceName, deviceCatalog, deviceSn, purchaseDate, conditions, selectedAccessories,
    customAccessory, notes, checkDiagnosisFee, cleaningPackage, selectedUpgrades,
    uploadedFileUrls, unitPhotoUrls, pcComponents, upgradeItems, pickupMethod, isOvernight,
    quote, buildPhotoUrls,
  };
  const draft = useDraft(useDraftKey("create-ticket"), draftData);

  const restoreDraft = () => {
    const d = draft.offer?.data;
    if (!d) return;
    setStep(d.step); setStoreLocationId(d.storeLocationId); setTechnicianId(d.technicianId);
    setSalesId(d.salesId); setUnitOwnership(d.unitOwnership); setStockOrigin(d.stockOrigin);
    setCustomerName(d.customerName); setCustomerEmail(d.customerEmail); setPhone(d.phone);
    setGridDevice(d.gridDevice); setTicketType(d.ticketType); setDeviceType(d.deviceType);
    setDeviceName(d.deviceName); setDeviceCatalog(d.deviceCatalog ?? null);
    setDeviceSn(d.deviceSn); setPurchaseDate(d.purchaseDate);
    setConditions(d.conditions); setSelectedAccessories(d.selectedAccessories);
    setCustomAccessory(d.customAccessory); setNotes(d.notes);
    setCheckDiagnosisFee(d.checkDiagnosisFee); setCleaningPackage(d.cleaningPackage);
    setSelectedUpgrades(d.selectedUpgrades); setUploadedFileUrls(d.uploadedFileUrls);
    setUnitPhotoUrls(d.unitPhotoUrls ?? []);
    // Drafts saved before 2026-10-26 hold components as plain strings and no
    // upgrade items; both come back as what they can be read as.
    setPcComponents(restorePickedItems(d.pcComponents));
    setUpgradeItems(
      Object.fromEntries(Object.entries(d.upgradeItems ?? {}).map(([id, items]) => [id, restorePickedItems(items).slice(0, 1)]))
    );
    setPickupMethod(d.pickupMethod); setIsOvernight(d.isOvernight);
    setQuote(d.quote ?? null); setBuildPhotoUrls(d.buildPhotoUrls ?? []);
  };

  // Restored on its own, once, as soon as the browser's draft can be read
  // (after hydration — the server cannot see it). The form autosaves, so asking
  // first only got in the way (owner, 2026-10-27). It cannot be someone else's
  // customer: drafts are per account (useDraftKey). Set during render, guarded
  // to run once — React re-renders straight away, with no effect cascade.
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  if (draft.offer && restoredAt === null) {
    setRestoredAt(draft.offer.savedAt);
    restoreDraft();
  }
  /** Throw the restored input away and start from an empty form. */
  const startOver = () => {
    draft.discard();
    window.location.reload();
  };

  // Shown under the picker when the draft brought back uploads the picker
  // itself cannot list (it only knows File objects, and those are gone).
  const restoredUploads = files.length === 0 && uploadedFileUrls.length > 0 && (
    <p className="text-xs text-muted-foreground">
      {uploadedFileUrls.length} lampiran dari draft sudah terunggah.{" "}
      <button type="button" onClick={() => setUploadedFileUrls([])} className={LINK_BUTTON}>
        Hapus
      </button>
    </p>
  );

  const getAvailableCases = () => {
    if (isStoreStock) return gridDevice && gridDevice !== "Build PC" ? ["warranty_claim"] : [];
    // "warranty_claim" opens the claim intake and, later, the handover to RMA.
    // It applies to any physical unit still under warranty; a Build PC is a
    // service we perform, not a unit that gets claimed.
    if (gridDevice === "Laptop" || gridDevice === "Computer")
      return ["service", "cleaning", "upgrade", "warranty_claim"];
    if (gridDevice === "Printer" || gridDevice === "Others")
      return ["service", "cleaning", "warranty_claim"];
    if (gridDevice === "Build PC") return ["pc_build"];
    return [];
  };

  const validateStep = () => {
    const errs: Record<string, string> = {};
    if (step === 1) {
      if (!storeLocationId) errs.storeLocationId = "Please select a store location.";
      if (isStoreStock) {
        if (!stockOrigin.trim()) errs.stockOrigin = "Asal stok wajib diisi.";
      } else {
        if (!customerName.trim()) errs.customerName = "Customer name is required.";
        if (!phone.match(/^\d{9,13}$/)) errs.phone = "Enter valid phone number digits (9-13 digits).";
        if (customerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
          errs.customerEmail = "Please enter a valid email address.";
        }
      }
    }
    if (step === 2) {
      if (!gridDevice) errs.gridDevice = "Please select a device.";
    }
    if (step === 3) {
      if (!ticketType) errs.ticketType = "Please select a case (Service, Cleaning, etc.).";
      if (ticketType === "service" || ticketType === "cleaning") {
        if (!deviceType) errs.deviceType = "Device category specification is required.";
      }
      if (ticketType === "service" && !notes.trim()) errs.notes = "Problem description is required.";
      if (ticketType === "warranty_claim") {
        // The RMA desk verifies the unit against both, so intake must capture them.
        if (!deviceSn.trim()) errs.deviceSn = "SN wajib diisi untuk klaim garansi.";
        if (!purchaseDate && !isStoreStock) errs.purchaseDate = "Tanggal pembelian wajib diisi untuk klaim garansi.";
        if (!notes.trim()) errs.notes = "Deskripsi keluhan wajib diisi untuk klaim garansi.";
      }
      if (ticketType === "cleaning" && !cleaningPackage) errs.cleaningPackage = "Cleaning package is required.";
      if (ticketType === "upgrade" && selectedUpgrades.length === 0) errs.selectedUpgrades = "Please select at least one upgrade.";
      if (ticketType === "pc_build" && quote) {
        if (quoteChecked.length !== quote.items.length) {
          errs.quote = "Centang setiap komponen yang sesuai dengan barang yang dibawa. Bila ada yang tidak sesuai, tekan \u201cAda yang tidak sesuai?\u201d.";
        }
        if (isUploadingBuildPhotos) errs.buildPhotos = "Tunggu sampai foto selesai terunggah.";
        else if (buildPhotoUrls.length === 0) errs.buildPhotos = "Lampirkan foto komponen rakitan yang dibawa.";
      }
    }
    if (step === 4) {
      if (!termsAccepted) errs.termsAccepted = "You must confirm the details.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => { if (validateStep()) setStep(s => s + 1); };
  const back = () => setStep(s => s - 1);

  /** Same pre-upload as the invoice box, into its own list. */
  const handleUnitPhotoUpload = async (picked: File[]) => {
    setUnitPhotos(picked);
    if (picked.length === 0) {
      setUnitPhotoUrls([]);
      return;
    }
    setIsUploadingUnitPhotos(true);
    try {
      const fd = new FormData();
      picked.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/upload-temp", { method: "POST", body: fd });
      const json = (await res.json()) as { uploaded?: { url: string }[]; error?: string };
      if (json.error) toast.error(`Upload foto gagal: ${json.error}`);
      else setUnitPhotoUrls((json.uploaded ?? []).map((u) => u.url));
    } catch {
      toast.error("Upload foto gagal. Coba lagi.");
    } finally {
      setIsUploadingUnitPhotos(false);
    }
  };

  /**
   * A quotation names the sales who issued it. When it matches a Sales account
   * and none was picked on step 1, that sales is assigned; a sales picked by
   * hand is kept, and the mismatch is pointed out under the checklist.
   */
  const handleQuoteChange = (next: UploadedQuote | null) => {
    setQuote(next);
    if (next?.sales && !salesId) {
      setSalesId(next.sales.id);
      toast.success(`Sales diisi dari quotation: ${next.sales.name}`);
    }
  };

  /** Photos of the components brought for a quotation build, pre-uploaded like the others. */
  const handleBuildPhotoUpload = async (picked: File[]) => {
    setBuildPhotos(picked);
    if (picked.length === 0) {
      setBuildPhotoUrls([]);
      return;
    }
    setIsUploadingBuildPhotos(true);
    try {
      const fd = new FormData();
      picked.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/upload-temp", { method: "POST", body: fd });
      const json = (await res.json()) as { uploaded?: { url: string }[]; error?: string };
      if (json.error) toast.error(`Upload foto gagal: ${json.error}`);
      else {
        setBuildPhotoUrls((json.uploaded ?? []).map((u) => u.url));
        setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== "buildPhotos")));
      }
    } catch {
      toast.error("Upload foto gagal. Coba lagi.");
    } finally {
      setIsUploadingBuildPhotos(false);
    }
  };

  const handleFileUpload = async (files: File[]) => {
    setFiles(files);
    if (files.length === 0) {
      setUploadedFileUrls([]);
      return;
    }
    setIsUploadingFiles(true);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append("files", f));
      const res = await fetch("/api/upload-temp", { method: "POST", body: fd });
      const json = await res.json() as { uploaded?: { url: string }[]; error?: string };
      if (json.error) {
        toast.error(`Upload failed: ${json.error}`);
      } else {
        setUploadedFileUrls((json.uploaded ?? []).map(u => u.url));
      }
    } catch (err: any) {
      toast.error("Failed to upload files. Please try again.");
    } finally {
      setIsUploadingFiles(false);
    }
  };

  const submit = () => {
    if (!validateStep()) return;

    startTransition(async () => {
      const fd = new FormData();
      fd.append("store_location_id", storeLocationId);
      if (technicianId) fd.append("technician_id", technicianId);
      if (salesId) fd.append("sales_id", salesId);

      fd.append("customer_type", "User"); // Fixed as per new rules
      fd.append("unit_ownership", unitOwnership);
      if (isStoreStock) {
        fd.append("stock_origin", stockOrigin.trim());
      } else {
        fd.append("customer_name", customerName);
        if (customerEmail) fd.append("customer_email", customerEmail);
        fd.append("phone", `+62${phone}`);
      }

      fd.append("ticket_type", ticketType);
      
      // If they didn't explicitly pick a device_type enum, map it based on grid
      let finalDeviceType = deviceType;
      if (!finalDeviceType) {
        if (gridDevice === "Laptop") finalDeviceType = "Laptop_Office";
        else if (gridDevice === "Computer" || gridDevice === "Build PC") finalDeviceType = "PC_Office";
        else if (gridDevice === "Printer") finalDeviceType = "Printer";
        else finalDeviceType = "Other_Device";
      }
      fd.append("device_type", finalDeviceType);
      
      fd.append("pickup_method", pickupMethod);
      if (deviceName) fd.append("device_name", deviceName);
      if (deviceCatalog) fd.append("device_catalog_item_id", String(deviceCatalog.id));
      if (deviceSn) fd.append("device_sn", deviceSn);
      if (ticketType === "warranty_claim" && purchaseDate) fd.append("purchase_date", purchaseDate);
      if (ticketType === "pc_build") {
        fd.append("pc_components_json", JSON.stringify(pcComponents.map(toPosted)));
        if (quote) {
          fd.append("quote_url", quote.url);
          fd.append("quote_checked_count", String(quoteChecked.length));
          buildPhotoUrls.forEach((url) => fd.append("build_photo_urls", url));
        }
      }
      fd.append("device_condition", conditions.join(", ")); // Saved to new field

      let accList = [...selectedAccessories];
      if (customAccessory.trim()) accList.push(customAccessory.trim());
      if (accList.length > 0) fd.append("accessories", accList.join(", "));

      if (notes) fd.append("notes", notes);
      
      // Auto diagnosis fee for service
      if (ticketType === "service" && checkDiagnosisFee) {
        fd.append("is_overnight_check", "1"); // Triggers the checking_fee in backend
      }

      if (ticketType === "cleaning" && cleaningPackage) fd.append("service_package", cleaningPackage);
      if (ticketType === "upgrade") {
        fd.append(
          "upgrade_selections_json",
          JSON.stringify(
            selectedUpgrades.map((id) => {
              const item = upgradeItems[id]?.at(0);
              return { upgradeId: id, item: item ? toPosted(item) : null };
            })
          )
        );
      }
      
      uploadedFileUrls.forEach(url => fd.append("preuploaded_urls", url));
      if (ticketType === "warranty_claim") {
        unitPhotoUrls.forEach((url) => fd.append("unit_photo_urls", url));
      }
      fd.append("is_for_self", "0");

      try {
        const result = await createTicketAction(fd) as any;
        if (result?.error) {
          toast.error(result.error);
          setErrors({ submit: result.error });
        } else if (result?.redirectUrl) {
          draft.finish();
          toast.success("Ticket created successfully!");
          router.push(result.redirectUrl);
        }
      } catch (err: any) {
        // Next moving the page (e.g. the login ran out) is not a failure.
        if (isNavigationSignal(err)) return;
        console.error("Action error:", err);
        const errMsg = err.message ? `Error: ${err.message}` : "An unexpected error occurred.";
        toast.error(errMsg + " (Please try again)");
        setErrors({ submit: errMsg });
      }
    });
  };

  const toggleCondition = (val: string) => {
    setConditions(prev => prev.includes(val) ? prev.filter(c => c !== val) : [...prev, val]);
  };

  const toggleAccessory = (val: string) => {
    setSelectedAccessories(prev => prev.includes(val) ? prev.filter(a => a !== val) : [...prev, val]);
  };

  const toggleUpgrade = (id: string) => {
    const deselecting = selectedUpgrades.includes(id);
    setSelectedUpgrades(prev => prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]);
    // An item picked for an upgrade that is then deselected must not ride
    // along unseen if the upgrade is chosen again later.
    if (deselecting) setUpgradeItems((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => key !== id)));
  };

  const store = storeLocations.find((s) => s.id === storeLocationId) ?? null;

  return (
    <div data-slot="create-ticket-form" className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
      {restoredAt !== null && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <History aria-hidden="true" className="size-[15px] shrink-0" />
          <span>
            Isian sebelumnya dipulihkan (
            {new Date(restoredAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            ).
          </span>
          <button type="button" onClick={startOver} className={LINK_BUTTON}>
            Kosongkan
          </button>
        </div>
      )}

      <Stepper step={step} />

      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col gap-6 p-5 md:p-8">
          {errors.submit && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
            >
              <AlertCircle aria-hidden="true" className="size-4 shrink-0" /> {errors.submit}
            </div>
          )}

          {/* Step 1: Intake & Assign */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <h2 className="text-lg font-semibold text-foreground">Intake & Assignment</h2>

              <FormField label="Store Location" htmlFor={`${uid}-store`} required error={errors.storeLocationId}>
                <NativeSelect
                  id={`${uid}-store`}
                  value={storeLocationId}
                  onChange={e => setStoreLocationId(e.target.value)}
                  aria-invalid={errors.storeLocationId ? true : undefined}
                >
                  <option value="">Select Store</option>
                  {storeLocations.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                </NativeSelect>
              </FormField>

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField label="Assign Technician" htmlFor={`${uid}-tech`}>
                  <NativeSelect id={`${uid}-tech`} value={technicianId} onChange={e => setTechnicianId(e.target.value)}>
                    <option value="">(Assign Later)</option>
                    {technicians
                      .filter(t => !storeLocationId || t.store_assignments.some(sa => sa.store_id === storeLocationId))
                      .map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </NativeSelect>
                </FormField>
                <FormField label="Assign Sales" htmlFor={`${uid}-sales`}>
                  <NativeSelect id={`${uid}-sales`} value={salesId} onChange={e => setSalesId(e.target.value)}>
                    <option value="">(Assign Later)</option>
                    {sales.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </NativeSelect>
                </FormField>
              </div>

              <Separator />

              <FieldGroup label="Unit milik" required>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["customer", "Customer"],
                    ["store_stock", "Stok Toko"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={unitOwnership === value}
                      onClick={() => {
                        setUnitOwnership(value);
                        // Stock only ever comes in as a claim; drop a device or
                        // case chosen earlier that no longer applies.
                        if (value === "store_stock") {
                          if (gridDevice === "Build PC") setGridDevice("");
                          setTicketType(gridDevice && gridDevice !== "Build PC" ? "warranty_claim" : "");
                        }
                      }}
                      className={buttonVariants({
                        variant: unitOwnership === value ? "default" : "outline",
                        className: cn("h-11 w-full md:h-10", unitOwnership !== value && "bg-card"),
                      })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {isStoreStock && (
                  <p className="text-xs text-muted-foreground">
                    Unit stok toko tidak punya customer, dan hanya bisa dibuat sebagai klaim garansi.
                  </p>
                )}
              </FieldGroup>

              {isStoreStock ? (
                <FormField label="Asal Stok" htmlFor={`${uid}-origin`} required error={errors.stockOrigin}>
                  <Input
                    id={`${uid}-origin`}
                    value={stockOrigin}
                    onChange={e => setStockOrigin(e.target.value)}
                    placeholder="Misal: Gudang Nagoya rak B3"
                    aria-invalid={errors.stockOrigin ? true : undefined}
                    className="bg-card"
                  />
                </FormField>
              ) : (
                <>
                  <h3 className="text-base font-semibold text-foreground">Customer Information</h3>

                  <FormField label="Customer Name" htmlFor={`${uid}-name`} required error={errors.customerName}>
                    <Input
                      id={`${uid}-name`}
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      placeholder="John Doe"
                      aria-invalid={errors.customerName ? true : undefined}
                      className="bg-card"
                    />
                  </FormField>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField label="Nomor HP / WhatsApp" htmlFor={`${uid}-phone`} required error={errors.phone}>
                      <span className="flex items-stretch">
                        <span
                          aria-hidden="true"
                          className="flex items-center rounded-l-lg border border-r-0 border-input bg-muted px-3 text-sm font-semibold text-muted-foreground"
                        >
                          +62
                        </span>
                        <Input
                          id={`${uid}-phone`}
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel-national"
                          value={phone}
                          onFocus={() => setPhoneFocused(true)}
                          onBlur={() => setPhoneFocused(false)}
                          onChange={e => {
                            let val = e.target.value.replace(/\D/g, "");
                            if (val.startsWith("62")) val = val.substring(2);
                            else if (val.startsWith("0")) val = val.substring(1);
                            setPhone(val);
                          }}
                          placeholder="8123456789"
                          aria-invalid={errors.phone ? true : undefined}
                          className="min-w-0 flex-1 rounded-l-none bg-card"
                        />
                      </span>
                      {phoneFocused && !phone.match(/^\d{9,13}$/) && (
                        <span className="text-xs text-destructive">Masukkan 9-13 digit angka.</span>
                      )}
                    </FormField>

                    <FormField label="Customer Email" htmlFor={`${uid}-email`} hint="(opsional)" error={errors.customerEmail}>
                      <Input
                        id={`${uid}-email`}
                        type="email"
                        value={customerEmail}
                        onChange={e => setCustomerEmail(e.target.value)}
                        placeholder="customer@email.com"
                        aria-invalid={errors.customerEmail ? true : undefined}
                        className="bg-card"
                      />
                    </FormField>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 2: Choose Device Grid */}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              <h2 className="text-center text-lg font-semibold text-foreground">Choose Device</h2>
              {errors.gridDevice && (
                <p role="alert" className="flex items-center justify-center gap-1.5 text-sm text-destructive">
                  <AlertCircle aria-hidden="true" className="size-3.5" />
                  {errors.gridDevice}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:flex md:flex-wrap md:justify-center md:gap-5">
                {DEVICES.filter(d => !(isStoreStock && d.id === "Build PC")).map(d => (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={gridDevice === d.id}
                    onClick={() => {
                      setGridDevice(d.id);
                      // Build PC has exactly one case, so it can be implied.
                      // Everything else waits for an explicit choice.
                      setTicketType(d.id === "Build PC" ? "pc_build" : isStoreStock ? "warranty_claim" : "");
                    }}
                    className={cn(
                      "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 px-3 py-6 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:w-[160px] md:gap-4 md:py-8",
                      gridDevice === d.id
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    )}
                  >
                    <d.icon aria-hidden="true" strokeWidth={1.5} className="size-10 md:size-12" />
                    <span className="text-base font-semibold">{d.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Service Details */}
          {step === 3 && (
            <div className="flex flex-col gap-6">
              <h2 className="text-lg font-semibold text-foreground">Service Details: {gridDevice}</h2>

              {/* Case Selection Tabs */}
              {gridDevice !== "Build PC" && (
                <FieldGroup label="Jenis Kasus" required error={errors.ticketType}>
                  {/* A grid, not a wrapping row: on a phone four buttons wrapped 3 + 1
                      and left the last one alone; this gives 2 × 2 there, one row here. */}
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2 border-b border-border pb-4">
                    {getAvailableCases().map(caseType => {
                      const labels: Record<string, string> = { service: "Service", cleaning: "Cleaning", upgrade: "Upgrade Part", pc_build: "Build PC", warranty_claim: "Warranty Claim" };
                      return (
                        <button
                          key={caseType}
                          type="button"
                          aria-pressed={ticketType === caseType}
                          onClick={() => setTicketType(caseType)}
                          className={cn(CHIP, "h-11 justify-center md:h-9", ticketType === caseType ? CHIP_ON : CHIP_OFF)}
                        >
                          {labels[caseType]}
                        </button>
                      );
                    })}
                  </div>
                </FieldGroup>
              )}
              {gridDevice === "Build PC" && errors.ticketType && (
                <p role="alert" className="text-sm text-destructive">{errors.ticketType}</p>
              )}

              {/* Warranty Claim */}
              {ticketType === "warranty_claim" && (
                <div className="flex flex-col gap-5">
                  {/* Full width: catalogue names run to two lines, and in half a
                      column the result list became a tall, narrow strip. */}
                  <UnitField
                    catalogEnabled={catalogEnabled}
                    unit={deviceCatalog}
                    onUnitChange={setDeviceCatalog}
                    name={deviceName}
                    onNameChange={setDeviceName}
                    label="Nama Perangkat"
                  />

                  {/* The two short fields side by side; stacked on a phone. */}
                  <div className="grid items-start gap-5 sm:grid-cols-2">
                    <FormField
                      label="SN"
                      htmlFor={`${uid}-sn`}
                      required
                      help="Diverifikasi ulang oleh RMA sebelum diajukan ke vendor."
                      error={errors.deviceSn}
                    >
                      <Input
                        id={`${uid}-sn`}
                        value={deviceSn}
                        onChange={e => setDeviceSn(e.target.value)}
                        placeholder="Misal: 12345ABCD"
                        aria-invalid={errors.deviceSn ? true : undefined}
                        className="bg-card"
                      />
                    </FormField>

                    <FormField
                      label="Tanggal Pembelian"
                      htmlFor={`${uid}-purchase`}
                      required={!isStoreStock}
                      hint={isStoreStock ? "(opsional)" : undefined}
                      help={isStoreStock ? "Kosongkan bila tidak ada." : "Sesuai tanggal pada nota pembelian."}
                      error={errors.purchaseDate}
                    >
                      <Input
                        id={`${uid}-purchase`}
                        type="date"
                        value={purchaseDate}
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={e => setPurchaseDate(e.target.value)}
                        aria-invalid={errors.purchaseDate ? true : undefined}
                        className="bg-card"
                      />
                    </FormField>
                  </div>

                  <FormField label="Deskripsi Keluhan" htmlFor={`${uid}-notes`} required error={errors.notes}>
                    <Textarea
                      id={`${uid}-notes`}
                      rows={4}
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Jelaskan kerusakan yang diklaim customer..."
                      aria-invalid={errors.notes ? true : undefined}
                      className="resize-y bg-card"
                    />
                  </FormField>

                  <FieldGroup
                    label="Nota Pembelian"
                    hint="(opsional saat intake)"
                    help={
                      <>
                        Unggah foto/scan nota sekarang agar teknisi dapat memilihnya saat menyerahkan
                        unit ke RMA.{" "}
                        {isStoreStock
                          ? "Untuk unit stok toko, nota tidak wajib."
                          : "Nota wajib ada sebelum klaim unit milik customer diserahkan ke RMA."}
                      </>
                    }
                  >
                    <FileUpload value={files} onChange={handleFileUpload} maxFiles={5} />
                    {restoredUploads}
                    {isUploadingFiles && <Uploading>Uploading files…</Uploading>}
                  </FieldGroup>

                  <FieldGroup
                    label="Foto Barang yang Diklaim"
                    hint={`(opsional, maks ${MAX_UNIT_PHOTOS})`}
                    help={
                      <>
                        Foto kondisi unit saat diterima: tampak depan dan belakang, label serial number, dan
                        bagian yang dikeluhkan. Menjadi catatan kondisi unit saat masuk, terpisah dari nota.
                      </>
                    }
                  >
                    <FileUpload
                      value={unitPhotos}
                      onChange={handleUnitPhotoUpload}
                      maxFiles={MAX_UNIT_PHOTOS}
                      accept="image/*,image/heic,image/heif"
                    />
                    {unitPhotos.length === 0 && unitPhotoUrls.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {unitPhotoUrls.length} foto dari draft sudah terunggah.
                      </p>
                    )}
                    {isUploadingUnitPhotos && <Uploading>Mengunggah foto…</Uploading>}
                  </FieldGroup>
                </div>
              )}

              {/* PC Build */}
              {ticketType === "pc_build" && (
                <div className="flex flex-col gap-5">
                  <FieldGroup
                    label="Quotation Rakitan"
                    hint={quote ? undefined : "(bila ada)"}
                    help={
                      quote
                        ? "Centang setiap komponen yang memang dibawa dan sesuai. Tiket baru bisa dibuat bila semuanya sesuai."
                        : "Untuk rakitan dari quotation web, unggah PDF-nya. Tanpa quotation, isi komponen di bawah secara manual."
                    }
                  >
                    <QuoteChecklist
                      quote={quote}
                      onQuoteChange={handleQuoteChange}
                      checked={quoteChecked}
                      onCheckedChange={setQuoteChecked}
                      error={errors.quote}
                    />
                    {quote?.sales && salesId === quote.sales.id && (
                      <p className="text-xs text-tone-green-fg">
                        Sales tiket ini: <span className="font-semibold">{quote.sales.name}</span> (dari quotation).
                      </p>
                    )}
                    {quote?.sales && salesId && salesId !== quote.sales.id && (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-tone-amber-border bg-tone-amber-bg px-3 py-2 text-sm text-tone-amber-fg">
                        <span>
                          Quotation diterbitkan oleh <span className="font-semibold">{quote.sales.name}</span>, tetapi di langkah 1
                          dipilih <span className="font-semibold">{sales.find((s) => s.id === salesId)?.name ?? "sales lain"}</span>.
                        </span>
                        <Button type="button" size="sm" variant="outline" onClick={() => setSalesId(quote.sales!.id)} className="h-11 bg-card md:h-8">
                          Pakai {quote.sales.name}
                        </Button>
                      </div>
                    )}
                    {/* The customer was typed in step 1 and is printed on the quotation:
                        the same name is not asked twice, but a different one is pointed out. */}
                    {quote?.customer && customerName.trim() && normalizeName(customerName) !== normalizeName(quote.customer) && (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-tone-amber-border bg-tone-amber-bg px-3 py-2 text-sm text-tone-amber-fg">
                        <span>
                          Pelanggan di quotation: <span className="font-semibold">{quote.customer}</span>, tetapi di langkah 1
                          tertulis <span className="font-semibold">{customerName.trim()}</span>.
                        </span>
                        <Button type="button" size="sm" variant="outline" onClick={() => setCustomerName(quote.customer!)} className="h-11 bg-card md:h-8">
                          Pakai nama dari quotation
                        </Button>
                      </div>
                    )}
                    {quote?.salesName && !quote.sales && (
                      <p className="text-xs text-muted-foreground">
                        Sales di quotation: <span className="font-semibold">{quote.salesName}</span> — tidak ada akun Sales dengan nama
                        itu di sistem tiket. Pilih sales di langkah 1 bila perlu.
                      </p>
                    )}
                  </FieldGroup>

                  <FieldGroup label={quote ? "Komponen Tambahan" : "Komponen PC"} hint="(opsional)">
                    <CatalogItemList
                      items={pcComponents}
                      onChange={setPcComponents}
                      catalogEnabled={catalogEnabled}
                      max={MAX_PC_COMPONENTS}
                      store={store}
                      searchPlaceholder="Cari komponen di katalog, mis. rtx 4060"
                      manualPlaceholder="Nama komponen, mis. i5-13400F"
                      addAnotherLabel="Tambah komponen"
                    />
                    <p className="text-xs text-muted-foreground">
                      {quote
                        ? "Barang yang dibawa tetapi tidak ada di quotation, mis. komponen milik customer sendiri."
                        : "Komponen yang dibeli customer atau disiapkan untuk rakitan ini."}
                    </p>
                  </FieldGroup>

                  <FormField label="Notes / Instructions" htmlFor={`${uid}-notes`}>
                    <Textarea
                      id={`${uid}-notes`}
                      rows={4}
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Describe any specific instructions or build requirements..."
                      className="resize-y bg-card"
                    />
                  </FormField>

                  {quote ? (
                    <FieldGroup
                      label="Foto Komponen Rakitan"
                      required
                      hint={`(maks ${MAX_BUILD_PHOTOS})`}
                      help="Foto semua komponen yang dibawa, sebagai bukti barang yang diterima sesuai quotation."
                      error={errors.buildPhotos}
                    >
                      <FileUpload
                        value={buildPhotos}
                        onChange={handleBuildPhotoUpload}
                        maxFiles={MAX_BUILD_PHOTOS}
                        accept="image/*,image/heic,image/heif"
                      />
                      {buildPhotos.length === 0 && buildPhotoUrls.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {buildPhotoUrls.length} foto dari draft sudah terunggah.{" "}
                          <button type="button" onClick={() => setBuildPhotoUrls([])} className={LINK_BUTTON}>
                            Hapus
                          </button>
                        </p>
                      )}
                      {isUploadingBuildPhotos && <Uploading>Mengunggah foto…</Uploading>}
                    </FieldGroup>
                  ) : (
                    <FieldGroup
                      label="Ticket Attachment"
                      required
                      help="Upload any reference pictures or build lists."
                      error={errors.ticketFiles}
                    >
                      <FileUpload value={files} onChange={handleFileUpload} maxFiles={5} />
                      {restoredUploads}
                      {isUploadingFiles && <Uploading>Uploading files…</Uploading>}
                    </FieldGroup>
                  )}
                </div>
              )}

              {/* Service & Cleaning Shared Fields */}
              {(ticketType === "service" || ticketType === "cleaning") && (
                <div className="flex flex-col gap-5">
                  {ticketType === "cleaning" && (
                    <FormField
                      label="Cleaning Package"
                      htmlFor={`${uid}-package`}
                      required
                      error={errors.cleaningPackage}
                      className="rounded-lg bg-muted p-4"
                    >
                      <NativeSelect
                        id={`${uid}-package`}
                        value={cleaningPackage}
                        onChange={e => setCleaningPackage(e.target.value)}
                        aria-invalid={errors.cleaningPackage ? true : undefined}
                      >
                        <option value="">Pilih Paket Cleaning</option>
                        <option value="Basic_Cleaning">Basic Cleaning</option>
                        {(gridDevice === "Laptop" || gridDevice === "Computer") && (
                          <option value="Full_Repaste">Full Cleaning + Repaste</option>
                        )}
                        {gridDevice === "Computer" && (
                          <option value="Full_Repaste_CPU_GPU">Full Cleaning + Repaste CPU & GPU</option>
                        )}
                      </NativeSelect>
                    </FormField>
                  )}

                  <FormField label="Device Type" htmlFor={`${uid}-device-type`} required error={errors.deviceType}>
                    <NativeSelect
                      id={`${uid}-device-type`}
                      value={deviceType}
                      onChange={e => setDeviceType(e.target.value)}
                      aria-invalid={errors.deviceType ? true : undefined}
                    >
                      <option value="">Pilih Kategori Spesifik</option>
                      {gridDevice === "Laptop" && (
                        <>
                          <option value="Laptop_Office">Laptop Office</option>
                          <option value="Laptop_Gaming">Laptop Gaming</option>
                        </>
                      )}
                      {gridDevice === "Computer" && (
                        <>
                          <option value="PC_Office">PC Office</option>
                          <option value="PC_Gaming">PC Gaming</option>
                        </>
                      )}
                      {gridDevice === "Printer" && <option value="Printer">Printer</option>}
                      {gridDevice === "Others" && <option value="Other_Device">Other Device</option>}
                    </NativeSelect>
                  </FormField>

                  <UnitField
                    catalogEnabled={catalogEnabled}
                    unit={deviceCatalog}
                    onUnitChange={setDeviceCatalog}
                    name={deviceName}
                    onNameChange={setDeviceName}
                    label="Nama Unit"
                  />

                  <FormField label="SN" htmlFor={`${uid}-sn`} hint="(opsional)">
                    <Input
                      id={`${uid}-sn`}
                      value={deviceSn}
                      onChange={e => setDeviceSn(e.target.value)}
                      placeholder="Misal: 12345ABCD"
                      className="bg-card"
                    />
                  </FormField>

                  <CheckGroup legend="Kondisi Perangkat" hint="(opsional)">
                    {["Garansi Aktif", "Garansi Habis", "Segel Utuh", "Fisik Mulus"].map(cond => (
                      <label key={cond} className={CHECK_LABEL}>
                        <input type="checkbox" checked={conditions.includes(cond)} onChange={() => toggleCondition(cond)} className={CHECKBOX} />
                        {cond}
                      </label>
                    ))}
                  </CheckGroup>

                  <CheckGroup
                    legend="Kelengkapan Accessories"
                    after={
                      <Input
                        value={customAccessory}
                        onChange={e => setCustomAccessory(e.target.value)}
                        placeholder="Kelengkapan lain (custom)..."
                        aria-label="Kelengkapan lain"
                        className="bg-card"
                      />
                    }
                  >
                    {["Charger", "Kabel", "Bag"].map(acc => (
                      <label key={acc} className={CHECK_LABEL}>
                        <input type="checkbox" checked={selectedAccessories.includes(acc)} onChange={() => toggleAccessory(acc)} className={CHECKBOX} />
                        {acc}
                      </label>
                    ))}
                  </CheckGroup>

                  {ticketType === "service" && (
                    <FormField label="Problem Description" htmlFor={`${uid}-notes`} required error={errors.notes}>
                      <Textarea
                        id={`${uid}-notes`}
                        rows={3}
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Provide details of the problem..."
                        aria-invalid={errors.notes ? true : undefined}
                        className="resize-y bg-card"
                      />
                    </FormField>
                  )}

                  {ticketType === "service" && (
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-muted p-4">
                      <input
                        type="checkbox"
                        checked={checkDiagnosisFee}
                        onChange={e => setCheckDiagnosisFee(e.target.checked)}
                        className="size-5 shrink-0 accent-primary"
                        disabled
                      />
                      <div>
                        <strong className="block font-semibold text-foreground">Check & Diagnosis</strong>
                        <span className="text-[0.8125rem] text-muted-foreground">Fee of Rp. 50.000 — added to Rincian Biaya automatically (can be removed there)</span>
                      </div>
                    </label>
                  )}

                  <FieldGroup label="Ticket Attachment" help="Upload photo/video of the device.">
                    <FileUpload value={files} onChange={handleFileUpload} maxFiles={5} />
                    {restoredUploads}
                    {isUploadingFiles && <Uploading>Uploading files…</Uploading>}
                  </FieldGroup>
                </div>
              )}

              {/* Upgrade Part */}
              {ticketType === "upgrade" && (
                <div className="flex flex-col gap-5">
                  <FieldGroup label="Select Upgrades" required error={errors.selectedUpgrades}>
                    <div className="flex flex-wrap gap-2">
                      {upgrades
                        .filter(u => {
                          if (gridDevice === "Laptop") return u.name.includes("RAM") || u.name.includes("SSD");
                          return true;
                        })
                        .map(u => (
                          <button
                            key={u.id}
                            type="button"
                            aria-pressed={selectedUpgrades.includes(u.id)}
                            onClick={() => toggleUpgrade(u.id)}
                            className={cn(CHIP, "min-h-11 px-4 md:min-h-9", selectedUpgrades.includes(u.id) ? CHIP_ON : CHIP_OFF)}
                          >
                            {u.name}
                          </button>
                        ))}
                    </div>
                  </FieldGroup>

                  {/* The item fitted for each chosen upgrade: the type keeps its
                      points, this records what was actually put in. */}
                  {upgrades
                    .filter((u) => selectedUpgrades.includes(u.id))
                    .map((u) => (
                      <FieldGroup key={u.id} label={`Barang untuk ${u.name}`} hint="(opsional)">
                        <CatalogItemList
                          items={upgradeItems[u.id] ?? []}
                          onChange={(items) => setUpgradeItems((prev) => ({ ...prev, [u.id]: items }))}
                          catalogEnabled={catalogEnabled}
                          max={1}
                          store={store}
                          searchPlaceholder="Cari barang di katalog, mis. ram ddr4 8gb"
                          manualPlaceholder="Nama barang, mis. RAM 8GB DDR4"
                        />
                      </FieldGroup>
                    ))}

                  <FieldGroup
                    label="Attachment (Upgraded Item)"
                    required
                    help="Please attach a photo of the item to be upgraded."
                  >
                    <FileUpload value={files} onChange={handleFileUpload} maxFiles={5} />
                    {restoredUploads}
                    {isUploadingFiles && <Uploading>Uploading files…</Uploading>}
                  </FieldGroup>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && (
            <div className="flex flex-col gap-5">
              <h2 className="text-lg font-semibold text-foreground">Confirm Ticket Details</h2>
              <div className="flex flex-col gap-1.5 rounded-xl bg-muted p-5 text-sm leading-relaxed text-foreground [overflow-wrap:anywhere] md:p-6 [&_strong]:font-semibold">
                <p><strong>Store:</strong> {storeLocations.find(s => s.id === storeLocationId)?.name}</p>
                {isStoreStock
                  ? <p><strong>Unit:</strong> Stok Toko — {stockOrigin}</p>
                  : <p><strong>Customer:</strong> {customerName} - +62{phone}</p>}
                <p><strong>Device:</strong> {gridDevice} ({deviceType || "N/A"})</p>
                {deviceName && (
                  <p>
                    <strong>Unit:</strong> {deviceName}
                    {deviceCatalog && ` (SKU ${deviceCatalog.sku}, katalog Accurate)`}
                  </p>
                )}
                <p><strong>Case:</strong> <span className="capitalize">{ticketType.replace(/_/g, " ")}</span></p>
                {salesId && <p><strong>Sales:</strong> {sales.find((s) => s.id === salesId)?.name ?? quote?.sales?.name}</p>}
                {ticketType === "pc_build" && quote && (
                  <p>
                    <strong>Quotation:</strong> {quote.code} · {quoteChecked.length}/{quote.items.length} komponen dicek sesuai ·{" "}
                    {buildPhotoUrls.length} foto komponen
                  </p>
                )}
                {ticketType === "pc_build" && pcComponents.length > 0 && (
                  <p><strong>{quote ? "Komponen tambahan" : "Komponen"}:</strong> {pcComponents.map((c) => `${c.name} ×${c.quantity}`).join(", ")}</p>
                )}
                {ticketType === "cleaning" && <p><strong>Package:</strong> {cleaningPackage.replace(/_/g, " ")}</p>}
                {ticketType === "service" && <p><strong>Problem:</strong> {notes}</p>}
                {conditions.length > 0 && <p><strong>Condition:</strong> {conditions.join(", ")}</p>}
                {(selectedAccessories.length > 0 || customAccessory) && (
                  <p><strong>Accessories:</strong> {[...selectedAccessories, customAccessory].filter(Boolean).join(", ")}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={e => setTermsAccepted(e.target.checked)}
                    aria-invalid={errors.termsAccepted ? true : undefined}
                    className="size-5 shrink-0 accent-primary"
                  />
                  <span className="text-sm font-medium text-foreground">I confirm the details above are accurate.</span>
                </label>
                {errors.termsAccepted && <p role="alert" className="text-sm text-destructive">{errors.termsAccepted}</p>}
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between gap-3 border-t border-border pt-5">
            {step > 1 ? (
              <Button type="button" variant="outline" onClick={back} disabled={isPending} className="h-11 bg-card md:h-9">
                <ChevronLeft aria-hidden="true" /> Back
              </Button>
            ) : <div />}

            {step < STEPS.length ? (
              <Button type="button" onClick={next} className="h-11 md:h-9">
                Next <ChevronRight aria-hidden="true" />
              </Button>
            ) : (
              <Button type="button" onClick={submit} disabled={isPending} className="h-11 md:h-9">
                {isPending ? "Creating..." : "Create Ticket"}
                {isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
