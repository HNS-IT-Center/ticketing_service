"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Plus } from "lucide-react";
import { createVendorAction, deleteVendorAction, updateVendorAction } from "@/app/actions/vendors";
import { DeleteEntryButton } from "@/components/app/DeleteEntryButton";
import {
  VENDOR_LOCATIONS,
  VENDOR_LOCATION_INFO,
  VENDOR_ROLES,
  VENDOR_ROLE_INFO,
  vendorLocationText,
  vendorRolesOf,
  type VendorLocation,
  type VendorRole,
  type VendorRoles,
} from "@/lib/vendors";
import { FormField } from "@/components/app/FormField";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { TONE_CLASSES, type StatusTone } from "@/lib/status-display";
import { cn } from "@/lib/utils";
import { isNavigationSignal } from "@/lib/navigation-signal";

export type VendorRowData = VendorRoles & {
  id: string;
  name: string;
  contact: string | null;
  location: VendorLocation | null;
  is_active: boolean;
  /** Bill lines and RMA cases that name it — a vendor in use cannot be deleted. */
  charges: number;
  cases: number;
};

function vendorInUse(v: VendorRowData): string | null {
  if (v.charges + v.cases === 0) return null;
  const used = [v.charges && `${v.charges} baris tagihan`, v.cases && `${v.cases} case RMA`].filter(Boolean).join(" dan ");
  return `Sudah tercatat di ${used} — nonaktifkan lewat Ubah, jangan dihapus.`;
}

const PILL = "rounded-full border px-2.5 py-0.5 text-[0.71875rem] font-bold whitespace-nowrap";

/** The same hues the role pills had, as tones. */
const ROLE_TONE: Record<VendorRole, StatusTone> = {
  supplies_parts: "blue",
  repairs: "violet",
  handles_claims: "amber",
};

export function RolePills({ vendor }: { vendor: VendorRoles }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {vendorRolesOf(vendor).map((role) => (
        <span key={role} className={cn(PILL, TONE_CLASSES[ROLE_TONE[role]])}>
          {VENDOR_ROLE_INFO[role].label}
        </span>
      ))}
    </span>
  );
}

/** Dalam kota (LKL) / luar kota (ITR), as the shop's supplier list codes it. */
function LocationSelect({ id, value }: { id: string; value?: VendorLocation | null }) {
  return (
    <NativeSelect id={id} name="location" defaultValue={value ?? ""}>
      <option value="">Lokasi belum diisi</option>
      {VENDOR_LOCATIONS.map((l) => (
        <option key={l} value={l}>
          {vendorLocationText(l)}
        </option>
      ))}
    </NativeSelect>
  );
}

export function LocationPill({ location }: { location: VendorLocation | null }) {
  if (!location) return <span className="text-muted-foreground">—</span>;
  const far = location === "out_of_town";
  return (
    <span className={cn(PILL, TONE_CLASSES[far ? "orange" : "green"])} title={vendorLocationText(location) ?? undefined}>
      {VENDOR_LOCATION_INFO[location].code} · {VENDOR_LOCATION_INFO[location].label}
    </span>
  );
}

function RoleChecks({ checked }: { checked: Partial<VendorRoles> }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="mb-1.5 text-sm font-medium text-foreground">Peran</legend>
      {VENDOR_ROLES.map((role) => (
        <label key={role} className="flex min-h-11 cursor-pointer items-start gap-2.5 py-1.5 text-sm md:min-h-0">
          <input
            type="checkbox"
            name={role}
            value="1"
            defaultChecked={checked[role] ?? false}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span>
            <strong className="font-semibold">{VENDOR_ROLE_INFO[role].label}</strong>{" "}
            <span className="text-muted-foreground">— {VENDOR_ROLE_INFO[role].hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** Runs a vendor action; the form keeps what was typed when it fails. */
function useVendorSubmit() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const submit = (
    e: FormEvent<HTMLFormElement>,
    action: (fd: FormData) => Promise<{ error?: string } | { success: boolean }>,
    done: string,
    after: (form: HTMLFormElement) => void
  ) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      try {
        const r = await action(fd);
        if ("error" in r && r.error) return void toast.error(r.error);
        toast.success(done);
        after(form);
        router.refresh();
      } catch (err) {
        // Next moving the page (e.g. the login ran out) is not a failure.
        if (isNavigationSignal(err)) return;
        toast.error("Gagal menyimpan. Periksa koneksi lalu coba lagi.");
      }
    });
  };
  return { pending, submit };
}

export function NewVendorForm({ defaultRoles = {} }: { defaultRoles?: Partial<VendorRoles> }) {
  const { pending, submit } = useVendorSubmit();
  const id = useId();
  return (
    <form
      data-slot="new-vendor"
      onSubmit={(e) => submit(e, createVendorAction, "Vendor ditambahkan.", (form) => form.reset())}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs md:p-5"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="Nama vendor" htmlFor={`${id}-name`}>
          <Input id={`${id}-name`} name="name" required minLength={2} className="bg-card" placeholder="mis. Asus Service Center" />
        </FormField>
        <FormField label="Kontak" htmlFor={`${id}-contact`} hint="(opsional)">
          <Input id={`${id}-contact`} name="contact" className="bg-card" placeholder="No. WA / alamat" />
        </FormField>
        <FormField label="Lokasi" htmlFor={`${id}-location`} hint="(opsional)">
          <LocationSelect id={`${id}-location`} />
        </FormField>
      </div>
      <RoleChecks checked={defaultRoles} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Plus aria-hidden="true" />}
        {pending ? "Menyimpan…" : "Tambah vendor"}
      </Button>
    </form>
  );
}

/** "Ubah" on a vendor: the same fields as before, in a dialog instead of the table row. */
export function VendorEditDialog({ vendor }: { vendor: VendorRowData }) {
  const [open, setOpen] = useState(false);
  const { pending, submit } = useVendorSubmit();
  const id = useId();

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="bg-card" />}>Ubah</DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <form
          onSubmit={(e) =>
            submit(e, (fd) => updateVendorAction(vendor.id, fd), "Vendor diperbarui.", () => setOpen(false))
          }
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Ubah vendor</DialogTitle>
          </DialogHeader>

          <FormField label="Nama vendor" htmlFor={`${id}-name`}>
            <Input id={`${id}-name`} name="name" defaultValue={vendor.name} required minLength={2} className="bg-card" />
          </FormField>
          <FormField label="Kontak" htmlFor={`${id}-contact`}>
            <Input id={`${id}-contact`} name="contact" defaultValue={vendor.contact ?? ""} className="bg-card" placeholder="Kontak" />
          </FormField>
          <FormField label="Lokasi" htmlFor={`${id}-location`}>
            <LocationSelect id={`${id}-location`} value={vendor.location} />
          </FormField>
          <RoleChecks checked={vendor} />
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm md:min-h-9">
            <input type="checkbox" name="is_active" value="1" defaultChecked={vendor.is_active} className="size-5 accent-primary md:size-4" />
            Aktif
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A row's controls: "Ubah", and delete for a vendor nothing names yet. */
export function VendorRowActions({ vendor }: { vendor: VendorRowData }) {
  return (
    <span className="flex items-center justify-end gap-2">
      <VendorEditDialog vendor={vendor} />
      <DeleteEntryButton
        name={vendor.name}
        what="vendor"
        onDelete={() => deleteVendorAction(vendor.id)}
        blockedReason={vendorInUse(vendor)}
      />
    </span>
  );
}
