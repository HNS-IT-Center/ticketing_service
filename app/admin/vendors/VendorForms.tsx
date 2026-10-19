"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import type { VendorKind } from "@prisma/client";
import { createVendorAction, updateVendorAction } from "@/app/actions/vendors";

export const VENDOR_KIND_LABELS: Record<VendorKind, string> = {
  part_supplier: "Supplier part",
  repair_service: "Service eksternal (mis. IC)",
  both: "Keduanya",
};

function KindSelect({ defaultValue }: { defaultValue?: VendorKind }) {
  return (
    <select name="kind" defaultValue={defaultValue ?? "part_supplier"} className="form-input">
      {(Object.keys(VENDOR_KIND_LABELS) as VendorKind[]).map((k) => (
        <option key={k} value={k}>{VENDOR_KIND_LABELS[k]}</option>
      ))}
    </select>
  );
}

export function NewVendorForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      action={(fd) =>
        start(async () => {
          const r = await createVendorAction(fd);
          if ("error" in r && r.error) return void toast.error(r.error);
          toast.success("Vendor ditambahkan.");
          router.refresh();
        })
      }
      className="card grid gap-3 p-4 md:grid-cols-[2fr_1.5fr_2fr_auto] md:items-end"
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold">Nama vendor</span>
        <input name="name" required minLength={2} className="form-input" placeholder="mis. Toko Sparepart Jaya" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold">Jenis</span>
        <KindSelect />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold">Kontak <span className="font-normal" style={{ color: "var(--text-muted)" }}>(opsional)</span></span>
        <input name="contact" className="form-input" placeholder="No. WA / alamat" />
      </label>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Menyimpan…" : "Tambah"}
      </button>
    </form>
  );
}

export function VendorRow({
  vendor,
}: {
  vendor: { id: string; name: string; kind: VendorKind; contact: string | null; is_active: boolean };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  const save = (fd: FormData) =>
    start(async () => {
      const r = await updateVendorAction(vendor.id, fd);
      if ("error" in r && r.error) return void toast.error(r.error);
      toast.success("Vendor diperbarui.");
      setEditing(false);
      router.refresh();
    });

  if (!editing) {
    return (
      <tr style={{ opacity: vendor.is_active ? 1 : 0.55 }}>
        <td style={{ fontWeight: 600 }}>{vendor.name}</td>
        <td>{VENDOR_KIND_LABELS[vendor.kind]}</td>
        <td style={{ color: "var(--text-muted)" }}>{vendor.contact ?? "—"}</td>
        <td>{vendor.is_active ? "Aktif" : "Nonaktif"}</td>
        <td>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Ubah</button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={5}>
        <form action={save} className="grid gap-2 p-2 md:grid-cols-[2fr_1.5fr_2fr_auto_auto] md:items-center">
          <input name="name" defaultValue={vendor.name} required minLength={2} className="form-input" />
          <KindSelect defaultValue={vendor.kind} />
          <input name="contact" defaultValue={vendor.contact ?? ""} className="form-input" placeholder="Kontak" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" value="1" defaultChecked={vendor.is_active} /> Aktif
          </label>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>Simpan</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Batal</button>
          </div>
        </form>
      </td>
    </tr>
  );
}
