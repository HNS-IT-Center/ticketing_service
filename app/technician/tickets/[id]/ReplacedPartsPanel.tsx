"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Wrench, Plus, Trash2, Camera, X, Loader2 } from "lucide-react";
import type { ServicePart } from "@prisma/client";
import {
  MAX_PART_PHOTOS,
  SERVICE_PART_ORDER,
  requiresItemName,
  servicePartLabel,
} from "@/lib/service-parts";
import {
  addReplacedPartAction,
  removeReplacedPartAction,
} from "@/app/actions/technician";
import { uploadFailureMessage } from "@/lib/upload-limit";
import { MAX_QUANTITY, stockAtStore, type CatalogItem, type StoreRef } from "@/lib/catalog/items";
import CatalogItemPicker from "@/components/catalog/CatalogItemPicker";
import CatalogEntryToggle from "@/components/catalog/CatalogEntryToggle";
import { FormField } from "@/components/app/FormField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { TONE_CLASSES } from "@/lib/status-display";
import { cn } from "@/lib/utils";
import { isNavigationSignal } from "@/lib/navigation-signal";

export type ReplacedPartRow = {
  id: string;
  part: ServicePart;
  item_name: string | null;
  sku: string | null;
  quantity: number;
  notes: string | null;
  recorded_by_name: string;
  created_at: string;
  photos: { id: string; file_url: string }[];
};

/**
 * Parts replaced during a service, recorded by the technician holding the
 * ticket.
 *
 * The category is a picker and the item name is free text beside it, never
 * instead of it. Typing "ganti baterai" into one box would make the record
 * unreadable to any report — the same fault that forced the dashboard's brand
 * chart to be withdrawn, where "ASUS ROG" and "ROG JANGKAR" counted as two
 * manufacturers.
 *
 * The item itself is picked from the company catalogue when it is there
 * (Accurate, read through data.hnsitcenter.id), so the record carries a SKU a
 * report can count. Typing it by hand stays possible for what the catalogue
 * does not hold.
 */
export default function ReplacedPartsPanel({
  ticketId,
  parts,
  canEdit,
  catalogEnabled = false,
  store = null,
}: {
  ticketId: string;
  parts: ReplacedPartRow[];
  canEdit: boolean;
  /** Whether the catalogue API is configured; without it only free text is offered. */
  catalogEnabled?: boolean;
  /** The ticket's store, to show that store's stock in the search. */
  store?: StoreRef | null;
}) {
  const router = useRouter();
  const [part, setPart] = useState<ServicePart>("lcd");
  const [itemName, setItemName] = useState("");
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [manual, setManual] = useState(!catalogEnabled);
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [isPending, startTransition] = useTransition();

  const nameRequired = requiresItemName(part);
  const qty = Number(quantity);
  const qtyValid = Number.isInteger(qty) && qty >= 1 && qty <= MAX_QUANTITY;
  const canSubmit = qtyValid && (!nameRequired || selected !== null || itemName.trim().length > 0);

  const pickPhotos = (chosen: FileList | null) => {
    if (!chosen) return;
    const next = [...photos, ...Array.from(chosen)].slice(0, MAX_PART_PHOTOS);
    if (photos.length + chosen.length > MAX_PART_PHOTOS) {
      toast.error(`Maksimal ${MAX_PART_PHOTOS} foto per part.`);
    }
    setPhotos(next);
  };

  const add = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("ticket_id", ticketId);
      formData.append("part", part);
      formData.append("item_name", selected ? "" : itemName);
      if (selected) formData.append("catalog_item_id", String(selected.id));
      formData.append("quantity", String(qty));
      formData.append("notes", notes);
      for (const photo of photos) formData.append("photos", photo);

      let result: Awaited<ReturnType<typeof addReplacedPartAction>>;
      try {
        result = await addReplacedPartAction(formData);
      } catch (err) {
        // Next moving the page (e.g. the login ran out) is not a failure.
        if (isNavigationSignal(err)) return;
        console.error("[replaced part] send failed:", err);
        toast.error(uploadFailureMessage(err));
        return;
      }
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${servicePartLabel(part)} dicatat.`);
      setItemName("");
      setSelected(null);
      setQuantity("1");
      setNotes("");
      setPhotos([]);
      router.refresh();
    });
  };

  const remove = (id: string, label: string) => {
    startTransition(async () => {
      const result = await removeReplacedPartAction(id);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${label} dihapus dari catatan.`);
      router.refresh();
    });
  };

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Wrench aria-hidden="true" className="size-4 text-primary" />
          Part yang Diganti
          {parts.length > 0 && (
            <span className="rounded-full border border-border bg-muted px-2 py-px text-[0.71875rem] font-bold text-muted-foreground">
              {parts.length}
            </span>
          )}
        </CardTitle>
        <CardDescription className="text-[0.8125rem]">
          Pilih jenis part-nya, lalu cari barang yang dipasang di katalog. Jenis dan SKU-nya
          yang nanti dihitung di laporan.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {parts.length === 0 ? (
          <p className="text-[0.8125rem] text-muted-foreground italic">Belum ada part yang dicatat.</p>
        ) : (
          <ul>
            {parts.map((row) => (
              <li
                key={row.id}
                className="flex items-start justify-between gap-3 border-t border-border py-3 first:border-t-0 first:pt-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full border px-2.5 py-0.5 text-[0.71875rem] font-bold whitespace-nowrap", TONE_CLASSES.blue)}>
                      {servicePartLabel(row.part)}
                    </span>
                    {row.item_name && <span className="text-sm font-semibold [overflow-wrap:anywhere]">{row.item_name}</span>}
                    {row.quantity > 1 && <span className="text-[0.8125rem] font-bold">× {row.quantity}</span>}
                    {row.sku && <span className="text-[0.71875rem] text-muted-foreground">SKU {row.sku}</span>}
                  </div>
                  {row.notes && (
                    <p className="mt-1.5 text-[0.8125rem] text-muted-foreground [overflow-wrap:anywhere]">{row.notes}</p>
                  )}
                  {row.photos.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {row.photos.map((photo) => (
                        <a
                          key={photo.id}
                          href={photo.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-lg leading-none outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.file_url}
                            alt={`Foto ${servicePartLabel(row.part)}`}
                            className="size-[58px] rounded-lg border border-border object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.recorded_by_name} · {row.created_at}
                  </p>
                </div>

                {canEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => remove(row.id, servicePartLabel(row.part))}
                    disabled={isPending}
                    aria-label={`Hapus catatan ${servicePartLabel(row.part)}`}
                    className="shrink-0 bg-card text-destructive hover:text-destructive"
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))] gap-3">
              <FormField label="Jenis part" htmlFor={`part-kind-${ticketId}`}>
                <NativeSelect id={`part-kind-${ticketId}`} value={part} onChange={(e) => setPart(e.target.value as ServicePart)}>
                  {SERVICE_PART_ORDER.map((p) => (
                    <option key={p} value={p}>
                      {servicePartLabel(p)}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>

              <FormField label="Jumlah" htmlFor={`part-qty-${ticketId}`}>
                <Input
                  id={`part-qty-${ticketId}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_QUANTITY}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  aria-invalid={qtyValid ? undefined : true}
                  className="bg-card"
                />
              </FormField>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">
                Barang yang dipasang{" "}
                {nameRequired ? (
                  <span aria-hidden="true" className="text-destructive">*</span>
                ) : (
                  <span className="font-normal text-muted-foreground">(opsional)</span>
                )}
              </span>

              {selected ? (
                <div className={cn("flex items-start justify-between gap-3 rounded-lg border p-3", TONE_CLASSES.blue)}>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm font-semibold [overflow-wrap:anywhere]">{selected.name}</span>
                    <span className="text-xs">
                      SKU {selected.sku}
                      {selected.category ? ` · ${selected.category}` : ""}
                      {(stockAtStore(selected, store) ?? 0) > 0 ? ` · stok toko ini ${stockAtStore(selected, store)}` : ""}
                    </span>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(null)}>
                    Ganti
                  </Button>
                </div>
              ) : manual ? (
                <>
                  <Input
                    type="text"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="Contoh: Baterai ASUS C31N1915"
                    aria-label="Barang yang dipasang"
                    className="bg-card"
                  />
                  <p className="text-xs text-muted-foreground">
                    Tercatat sebagai &ldquo;di luar katalog&rdquo; di laporan, supaya admin tahu barang ini perlu
                    ditambahkan ke Accurate. Pilih dari katalog bila barangnya ada.
                  </p>
                  {catalogEnabled && (
                    <CatalogEntryToggle to="search" label="Cari di katalog barang" onClick={() => setManual(false)} />
                  )}
                </>
              ) : (
                <>
                  <CatalogItemPicker store={store} onPick={setSelected} />
                  <CatalogEntryToggle
                    to="manual"
                    question="Tidak ada di katalog?"
                    label="Tulis manual"
                    onClick={() => setManual(true)}
                  />
                </>
              )}
            </div>

            <FormField label="Catatan" htmlFor={`part-notes-${ticketId}`} hint=" (opsional)">
              <Textarea
                id={`part-notes-${ticketId}`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Kenapa diganti, kondisi part lamanya"
                className="resize-y bg-card"
              />
            </FormField>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">
                Foto part{" "}
                <span className="font-normal text-muted-foreground">
                  (opsional, maks {MAX_PART_PHOTOS}) — biasanya dus dan label namanya
                </span>
              </span>

              <label
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 self-start rounded-[10px] border border-dashed border-input bg-muted px-4 text-[0.84375rem] font-semibold text-muted-foreground focus-within:ring-3 focus-within:ring-ring/50",
                  photos.length >= MAX_PART_PHOTOS ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-primary hover:text-foreground",
                )}
              >
                <Camera aria-hidden="true" className="size-4" />
                {photos.length === 0 ? "Pilih foto" : `Tambah foto (${photos.length}/${MAX_PART_PHOTOS})`}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={photos.length >= MAX_PART_PHOTOS}
                  onChange={(e) => {
                    pickPhotos(e.target.files);
                    e.target.value = "";
                  }}
                  className="sr-only"
                />
              </label>

              {photos.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {photos.map((file, i) => (
                    <li
                      key={`${file.name}-${i}`}
                      className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted py-0.5 pr-0.5 pl-3 text-[0.78125rem]"
                    >
                      <span className="max-w-[180px] truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                        aria-label={`Buang ${file.name}`}
                        className="flex size-7 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <X aria-hidden="true" className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button type="button" onClick={add} disabled={!canSubmit || isPending}>
                {isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Plus aria-hidden="true" />}
                {isPending ? "Menyimpan…" : "Tambah part"}
              </Button>
              {nameRequired && !canSubmit && (
                <span className="text-[0.78125rem] text-destructive">
                  Nama barang wajib diisi bila jenis part-nya Lainnya.
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
