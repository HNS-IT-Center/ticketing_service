"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { createVendorAction, updateVendorAction } from "@/app/actions/vendors";
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

export type VendorRowData = VendorRoles & {
  id: string;
  name: string;
  contact: string | null;
  location: VendorLocation | null;
  is_active: boolean;
};

const ROLE_STYLE: Record<VendorRole, { bg: string; fg: string; border: string }> = {
  supplies_parts: { bg: "#dbeafe", fg: "#1e40af", border: "#bfdbfe" },
  repairs: { bg: "#f3e8ff", fg: "#6b21a8", border: "#e9d5ff" },
  handles_claims: { bg: "#fef3c7", fg: "#92400e", border: "#fde68a" },
};

export function RolePills({ vendor }: { vendor: VendorRoles }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {vendorRolesOf(vendor).map((role) => (
        <span
          key={role}
          className="whitespace-nowrap rounded-full text-[0.71875rem] font-bold"
          style={{
            background: ROLE_STYLE[role].bg,
            color: ROLE_STYLE[role].fg,
            border: `1px solid ${ROLE_STYLE[role].border}`,
            padding: "0.1rem 0.6rem",
          }}
        >
          {VENDOR_ROLE_INFO[role].label}
        </span>
      ))}
    </span>
  );
}

/** Dalam kota (LKL) / luar kota (ITR), as the shop's supplier list codes it. */
function LocationSelect({ value }: { value?: VendorLocation | null }) {
  return (
    <select name="location" defaultValue={value ?? ""} className="form-input" aria-label="Lokasi vendor">
      <option value="">Lokasi belum diisi</option>
      {VENDOR_LOCATIONS.map((l) => (
        <option key={l} value={l}>
          {vendorLocationText(l)}
        </option>
      ))}
    </select>
  );
}

function LocationPill({ location }: { location: VendorLocation | null }) {
  if (!location) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const far = location === "out_of_town";
  return (
    <span
      className="whitespace-nowrap rounded-full text-[0.71875rem] font-bold"
      title={vendorLocationText(location) ?? undefined}
      style={{
        background: far ? "#ffedd5" : "#dcfce7",
        color: far ? "#9a3412" : "#166534",
        border: `1px solid ${far ? "#fed7aa" : "#bbf7d0"}`,
        padding: "0.1rem 0.6rem",
      }}
    >
      {VENDOR_LOCATION_INFO[location].code} · {VENDOR_LOCATION_INFO[location].label}
    </span>
  );
}

function RoleChecks({ checked }: { checked: Partial<VendorRoles> }) {
  return (
    <fieldset className="flex flex-col gap-1.5 border-0">
      <legend className="text-sm font-semibold" style={{ marginBottom: "0.35rem" }}>
        Peran
      </legend>
      {VENDOR_ROLES.map((role) => (
        <label key={role} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name={role}
            value="1"
            defaultChecked={checked[role] ?? false}
            style={{ marginTop: "0.2rem" }}
          />
          <span>
            <strong>{VENDOR_ROLE_INFO[role].label}</strong>{" "}
            <span style={{ color: "var(--text-muted)" }}>— {VENDOR_ROLE_INFO[role].hint}</span>
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
      } catch {
        toast.error("Gagal menyimpan. Periksa koneksi lalu coba lagi.");
      }
    });
  };
  return { pending, submit };
}

export function NewVendorForm({ defaultRoles = {} }: { defaultRoles?: Partial<VendorRoles> }) {
  const { pending, submit } = useVendorSubmit();
  return (
    <form
      onSubmit={(e) => submit(e, createVendorAction, "Vendor ditambahkan.", (form) => form.reset())}
      className="card flex flex-col gap-4"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Nama vendor</span>
          <input name="name" required minLength={2} className="form-input" placeholder="mis. Asus Service Center" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">
            Kontak <span className="font-normal" style={{ color: "var(--text-muted)" }}>(opsional)</span>
          </span>
          <input name="contact" className="form-input" placeholder="No. WA / alamat" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">
            Lokasi <span className="font-normal" style={{ color: "var(--text-muted)" }}>(opsional)</span>
          </span>
          <LocationSelect />
        </label>
      </div>
      <RoleChecks checked={defaultRoles} />
      <button type="submit" className="btn btn-primary self-start" disabled={pending}>
        {pending ? "Menyimpan…" : "Tambah vendor"}
      </button>
    </form>
  );
}

export function VendorRow({ vendor, canManage }: { vendor: VendorRowData; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const { pending, submit } = useVendorSubmit();

  if (!editing) {
    return (
      <tr style={{ opacity: vendor.is_active ? 1 : 0.55 }}>
        <td style={{ fontWeight: 600 }}>{vendor.name}</td>
        <td>
          <RolePills vendor={vendor} />
        </td>
        <td>
          <LocationPill location={vendor.location} />
        </td>
        <td style={{ color: "var(--text-muted)" }}>{vendor.contact ?? "—"}</td>
        <td>{vendor.is_active ? "Aktif" : "Nonaktif"}</td>
        <td>
          {canManage && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
              Ubah
            </button>
          )}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={6}>
        <form
          onSubmit={(e) =>
            submit(e, (fd) => updateVendorAction(vendor.id, fd), "Vendor diperbarui.", () => setEditing(false))
          }
          className="flex flex-col gap-3"
          style={{ padding: "0.5rem 0" }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <input name="name" defaultValue={vendor.name} required minLength={2} className="form-input" />
            <input name="contact" defaultValue={vendor.contact ?? ""} className="form-input" placeholder="Kontak" />
            <LocationSelect value={vendor.location} />
          </div>
          <RoleChecks checked={vendor} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" value="1" defaultChecked={vendor.is_active} /> Aktif
          </label>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
              Simpan
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setEditing(false)}>
              Batal
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}
