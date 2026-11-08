"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Pencil } from "lucide-react";
import { updateTicketDetailsAction } from "@/app/actions/ticket-edit";
import UnitField, { type PickedUnit } from "@/components/catalog/UnitField";
import { FormField } from "@/components/app/FormField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { hasCustomerFields } from "@/lib/ticket-edit";
import { isNavigationSignal } from "@/lib/navigation-signal";
import type { TicketEditProps } from "@/lib/ticket-edit-server";

/** "+62812…" → "812…" for the box beside the fixed +62. Only the prefix goes. */
const localPart = (phone: string | null) => (phone ?? "").replace(/^\+?62/, "");

/**
 * "Ubah data tiket": correct what was typed wrong at intake. Rendered only for
 * whoever holds `edit_ticket` (Admin → Pengaturan Akses); the action checks
 * the same setting. Every save is written to the activity log with the old
 * values.
 */
export default function EditTicketButton({ ticketId, ticketCode, context, values, unit: initialUnit, catalogEnabled }: TicketEditProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState<PickedUnit | null>(initialUnit);
  const [deviceName, setDeviceName] = useState(values.device_name ?? "");
  const id = useId();
  const customer = hasCustomerFields(context);

  const reset = () => {
    setUnit(initialUnit);
    setDeviceName(values.device_name ?? "");
    setError(null);
  };

  const submit = (formData: FormData) => {
    setError(null);
    formData.set("device_name", deviceName);
    formData.set("device_catalog_item_id", unit ? String(unit.id) : "");
    if (customer) {
      // Untouched, the number goes back exactly as stored, so saving another
      // field never rewrites it. Typed, a leading 0 is the habit "0812…".
      const phone = ((formData.get("customer_phone") as string | null) ?? "").trim();
      const unchanged = phone === localPart(values.customer_phone);
      formData.set("customer_phone", unchanged ? (values.customer_phone ?? "") : phone ? `+62${phone.replace(/^0/, "")}` : "");
    }
    startTransition(async () => {
      try {
        const res = await updateTicketDetailsAction(ticketId, formData);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        toast.success(res.changed ? "Data tiket diperbarui." : "Tidak ada yang berubah.");
        setOpen(false);
        router.refresh();
      } catch (err) {
        if (isNavigationSignal(err)) return;
        setError("Gagal menyimpan. Periksa koneksi lalu coba lagi.");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) reset();
        setOpen(next);
      }}
    >
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className="self-start">
        <Pencil aria-hidden="true" /> Ubah data tiket
      </Button>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Ubah data tiket {ticketCode}</DialogTitle>
          <DialogDescription>
            Untuk memperbaiki data yang salah input. Perubahan tercatat di Log Aktivitas beserta isi sebelumnya.
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-4" disabled={pending}>
            <legend className="mb-1 text-sm font-semibold text-foreground">Unit</legend>
            <UnitField
              catalogEnabled={catalogEnabled}
              unit={unit}
              onUnitChange={setUnit}
              name={deviceName}
              onNameChange={setDeviceName}
              label="Nama unit"
              optional={!values.device_name}
            />
            <FormField label="SN" htmlFor={`${id}-sn`} required={context.ticketType === "warranty_claim"}>
              <Input id={`${id}-sn`} name="device_sn" defaultValue={values.device_sn ?? ""} maxLength={191} className="bg-card" />
            </FormField>
            <FormField label="Kelengkapan" htmlFor={`${id}-acc`}>
              <Textarea id={`${id}-acc`} name="accessories" defaultValue={values.accessories ?? ""} rows={2} className="bg-card" />
            </FormField>
            <FormField label="Kondisi unit" htmlFor={`${id}-cond`}>
              <Textarea id={`${id}-cond`} name="device_condition" defaultValue={values.device_condition ?? ""} rows={2} className="bg-card" />
            </FormField>
          </fieldset>

          {customer && <div aria-hidden="true" className="border-t border-border" />}
          {customer && (
            <fieldset className="flex flex-col gap-4" disabled={pending}>
              <legend className="mb-1 text-sm font-semibold text-foreground">Customer</legend>
              <FormField label="Nama customer" htmlFor={`${id}-name`} required>
                <Input id={`${id}-name`} name="customer_name" defaultValue={values.customer_name ?? ""} maxLength={191} className="bg-card" />
              </FormField>
              <FormField label="No. HP" htmlFor={`${id}-phone`} required={context.ticketType === "warranty_claim"}>
                <div className="flex items-stretch">
                  <span className="flex items-center rounded-l-lg border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                    +62
                  </span>
                  <Input
                    id={`${id}-phone`}
                    name="customer_phone"
                    inputMode="numeric"
                    defaultValue={localPart(values.customer_phone)}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="rounded-l-none bg-card"
                  />
                </div>
              </FormField>
              <FormField label="Email" htmlFor={`${id}-email`} hint=" (opsional)">
                <Input id={`${id}-email`} name="customer_email" type="email" defaultValue={values.customer_email ?? ""} maxLength={191} className="bg-card" />
              </FormField>
              <FormField label="Alamat" htmlFor={`${id}-addr`} hint=" (opsional)">
                <Textarea id={`${id}-addr`} name="customer_address" defaultValue={values.customer_address ?? ""} rows={2} className="bg-card" />
              </FormField>
            </fieldset>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
              {pending ? "Menyimpan…" : "Simpan perubahan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
