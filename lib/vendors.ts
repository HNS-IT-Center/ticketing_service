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

/**
 * Where a vendor is. The shop's supplier list writes it as a code — LKL for in
 * town, ITR for out of town — so the code is shown beside the words.
 */
export const VENDOR_LOCATIONS = ["in_town", "out_of_town"] as const;
export type VendorLocation = (typeof VENDOR_LOCATIONS)[number];

export const VENDOR_LOCATION_INFO: Record<VendorLocation, { code: "LKL" | "ITR"; label: string }> = {
  in_town: { code: "LKL", label: "Dalam kota" },
  out_of_town: { code: "ITR", label: "Luar kota" },
};

/** "Luar kota (ITR)", or null when the location was never recorded. */
export function vendorLocationText(location: VendorLocation | null | undefined): string | null {
  if (!location) return null;
  const info = VENDOR_LOCATION_INFO[location];
  return `${info.label} (${info.code})`;
}

/** The form's select: one of the two values, or nothing chosen. */
export function readVendorLocation(formData: FormData): VendorLocation | null {
  const raw = formData.get("location");
  return VENDOR_LOCATIONS.find((l) => l === raw) ?? null;
}

/** A code from the supplier list ("LKL" / "ITR", any case) → the stored value. */
export function vendorLocationFromCode(code: string): VendorLocation | null {
  const c = code.trim().toUpperCase();
  return VENDOR_LOCATIONS.find((l) => VENDOR_LOCATION_INFO[l].code === c) ?? null;
}
