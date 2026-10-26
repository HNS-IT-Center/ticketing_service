/**
 * What the shop uses a vendor for — one list, read by the vendor pages, the
 * service bill and the RMA desk.
 *
 * Flags rather than one choice: a distributor that sells parts often takes its
 * brand's warranty claims too, and a single "kind" would force picking one.
 */

export const VENDOR_ROLES = ["supplies_parts", "repairs", "handles_claims"] as const;
export type VendorRole = (typeof VENDOR_ROLES)[number];
export type VendorRoles = Record<VendorRole, boolean>;

export const VENDOR_ROLE_INFO: Record<VendorRole, { label: string; hint: string }> = {
  supplies_parts: { label: "Supplier part", hint: "Menjual part yang dipasang saat service." },
  repairs: { label: "Service eksternal", hint: "Mengerjakan perbaikan yang tidak dikerjakan toko, mis. IC atau board." },
  handles_claims: { label: "Klaim garansi", hint: "Menerima klaim garansi dari tim RMA." },
};

export function vendorRolesOf(vendor: VendorRoles): VendorRole[] {
  return VENDOR_ROLES.filter((role) => vendor[role]);
}

/** The roles as the vendor forms post them: a checkbox per role, sent only when ticked. */
export function readVendorRoles(formData: FormData): VendorRoles {
  return {
    supplies_parts: formData.get("supplies_parts") === "1",
    repairs: formData.get("repairs") === "1",
    handles_claims: formData.get("handles_claims") === "1",
  };
}
