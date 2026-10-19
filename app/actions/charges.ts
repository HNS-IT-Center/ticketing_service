"use server";

import { revalidatePath } from "next/cache";
import type { ChargeKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { chargePermissions } from "@/lib/charges-server";
import {
  MAX_CHARGE_QUANTITY,
  MAX_DESCRIPTION,
  isAddableChargeKind,
  isExternalResult,
  parseRupiah,
  vendorFitsCharge,
  type ChargePermissions,
} from "@/lib/charges";

/**
 * The bill of a service ticket — "Rincian Biaya".
 *
 * Two questions guard every write, answered separately: may this person change
 * this ticket's bill at all (whose ticket it is — `mayEditCharges`), and may
 * they set this field (the owner's settings — `edit_price`, `edit_cost`). A
 * field the caller may not set is refused when it is sent, never silently
 * dropped, and left untouched when it is absent: a technician who cannot see
 * the cost saves a price without erasing the cost a senior entered.
 *
 * Nothing here returns a cost. The panel re-reads the page after a save, and
 * the page decides what the viewer may see.
 */

type Fail = { error: string };
type Ok = { success: true };

const TICKET_SCOPE = {
  id: true,
  ticket_type: true,
  technician_id: true,
  sales_id: true,
  store_location_id: true,
  status: true,
} as const;

function revalidateTicket(ticketId: string) {
  revalidatePath(`/technician/tickets/${ticketId}`);
  revalidatePath(`/admin/tickets/${ticketId}`);
  revalidatePath(`/sales/tickets/${ticketId}`);
}

async function guardTicket(ticketId: string): Promise<Fail | { userId: string; perms: ChargePermissions }> {
  const session = await requireSession();
  const ticket = await db.ticket.findUnique({ where: { id: ticketId }, select: TICKET_SCOPE });
  if (!ticket) return { error: "Tiket tidak ditemukan." };
  if (ticket.ticket_type !== "service") return { error: "Rincian biaya hanya ada pada tiket service." };
  const perms = await chargePermissions(session.userId, ticket);
  if (!perms.canEdit) return { error: "Anda tidak dapat mengubah rincian biaya tiket ini." };
  return { userId: session.userId, perms };
}

/**
 * The two prices, read only when sent. Returns the fields to write, or why not.
 */
function readPrices(formData: FormData, perms: ChargePermissions): Fail | { unit_price?: number | null; unit_cost?: number | null } {
  const out: { unit_price?: number | null; unit_cost?: number | null } = {};
  if (formData.has("unit_price")) {
    if (!perms.canEditPrice) return { error: "Anda tidak punya akses untuk mengisi harga jual." };
    const parsed = parseRupiah(String(formData.get("unit_price")));
    if (!parsed.ok) return { error: "Harga jual tidak valid. Tulis angka saja, mis. 150000." };
    out.unit_price = parsed.value;
  }
  if (formData.has("unit_cost")) {
    if (!perms.canEditCost) return { error: "Anda tidak punya akses untuk mengisi harga modal." };
    const parsed = parseRupiah(String(formData.get("unit_cost")));
    if (!parsed.ok) return { error: "Harga modal tidak valid. Tulis angka saja, mis. 150000." };
    out.unit_cost = parsed.value;
  }
  return out;
}

function readQuantity(formData: FormData): Fail | number {
  const quantity = Number(String(formData.get("quantity") ?? "1").trim() || "1");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_CHARGE_QUANTITY) {
    return { error: `Jumlah harus angka 1–${MAX_CHARGE_QUANTITY}.` };
  }
  return quantity;
}

function readDescription(formData: FormData): Fail | string {
  const description = String(formData.get("description") ?? "").trim().replace(/\s+/g, " ");
  if (!description) return { error: "Keterangan wajib diisi." };
  if (description.length > MAX_DESCRIPTION) return { error: `Keterangan maksimal ${MAX_DESCRIPTION} karakter.` };
  return description;
}

/**
 * The vendor sent with the form, checked. `undefined` = not sent (leave as is),
 * `null` = cleared. A vendor already on the line may stay even after it was
 * deactivated; choosing one anew requires an active one.
 */
async function readVendor(
  formData: FormData,
  kind: ChargeKind,
  current: string | null,
): Promise<Fail | { vendor_id: string | null } | undefined> {
  if (!formData.has("vendor_id")) return undefined;
  const id = String(formData.get("vendor_id") ?? "").trim();
  if (!id) {
    if (kind === "external_service") return { error: "Pilih vendor yang mengerjakan service eksternal." };
    return { vendor_id: null };
  }
  if (id === current) return { vendor_id: id };
  const vendor = await db.vendor.findUnique({ where: { id }, select: { kind: true, is_active: true } });
  if (!vendor || !vendor.is_active) return { error: "Vendor tidak ditemukan atau sudah nonaktif." };
  if (!vendorFitsCharge(kind, vendor.kind)) {
    return {
      error:
        kind === "external_service"
          ? "Vendor ini terdaftar sebagai supplier part, bukan service eksternal. Ubah jenisnya di Daftar Vendor bila keliru."
          : "Vendor ini terdaftar sebagai service eksternal, bukan supplier part. Ubah jenisnya di Daftar Vendor bila keliru.",
    };
  }
  return { vendor_id: id };
}

/**
 * Add a line by hand: the shop's labour, work sent to a vendor, or anything
 * else. Adding external work IS sending it — the line is created at the vendor.
 */
export async function addChargeAction(formData: FormData): Promise<Fail | Ok> {
  const ticketId = String(formData.get("ticket_id") ?? "");
  const guard = await guardTicket(ticketId);
  if ("error" in guard) return guard;

  const kind = String(formData.get("kind") ?? "");
  if (!isAddableChargeKind(kind)) {
    return { error: "Baris part dibuat dari panel Part yang Diganti." };
  }
  const description = readDescription(formData);
  if (typeof description !== "string") return description;
  const quantity = readQuantity(formData);
  if (typeof quantity !== "number") return quantity;
  const prices = readPrices(formData, guard.perms);
  if ("error" in prices) return prices;
  const vendor = await readVendor(formData, kind, null);
  if (vendor && "error" in vendor) return vendor;
  if (kind === "external_service" && !vendor?.vendor_id) {
    return { error: "Pilih vendor yang mengerjakan service eksternal." };
  }

  await db.ticketCharge.create({
    data: {
      ticket_id: ticketId,
      kind,
      description,
      quantity,
      vendor_id: vendor?.vendor_id ?? null,
      ...prices,
      sent_at: kind === "external_service" ? new Date() : null,
      external_note: kind === "external_service" ? String(formData.get("external_note") ?? "").trim() || null : null,
      created_by_id: guard.userId,
    },
  });

  revalidateTicket(ticketId);
  return { success: true };
}

/**
 * Change a line. A part line's name and quantity belong to the replaced part
 * and are not edited here; its vendor and prices are.
 */
export async function updateChargeAction(chargeId: string, formData: FormData): Promise<Fail | Ok> {
  const charge = await db.ticketCharge.findUnique({
    where: { id: chargeId },
    select: { ticket_id: true, kind: true, vendor_id: true },
  });
  if (!charge) return { error: "Baris biaya tidak ditemukan." };
  const guard = await guardTicket(charge.ticket_id);
  if ("error" in guard) return guard;

  const data: Prisma.TicketChargeUncheckedUpdateInput = { updated_by_id: guard.userId };
  if (charge.kind !== "part") {
    if (formData.has("description")) {
      const description = readDescription(formData);
      if (typeof description !== "string") return description;
      data.description = description;
    }
    if (formData.has("quantity")) {
      const quantity = readQuantity(formData);
      if (typeof quantity !== "number") return quantity;
      data.quantity = quantity;
    }
  }
  if (charge.kind === "external_service" && formData.has("external_note")) {
    data.external_note = String(formData.get("external_note") ?? "").trim() || null;
  }
  const prices = readPrices(formData, guard.perms);
  if ("error" in prices) return prices;
  Object.assign(data, prices);
  const vendor = await readVendor(formData, charge.kind, charge.vendor_id);
  if (vendor && "error" in vendor) return vendor;
  if (vendor) data.vendor_id = vendor.vendor_id;

  await db.ticketCharge.update({ where: { id: chargeId }, data });
  revalidateTicket(charge.ticket_id);
  return { success: true };
}

/** Remove a line added by hand. A part line goes when its part is removed. */
export async function removeChargeAction(chargeId: string): Promise<Fail | Ok> {
  const charge = await db.ticketCharge.findUnique({
    where: { id: chargeId },
    select: { ticket_id: true, replaced_part_id: true },
  });
  if (!charge) return { error: "Baris biaya tidak ditemukan." };
  const guard = await guardTicket(charge.ticket_id);
  if ("error" in guard) return guard;
  if (charge.replaced_part_id) {
    return { error: "Baris ini milik part yang diganti. Hapus part-nya di panel Part yang Diganti; harganya ikut terhapus." };
  }
  await db.ticketCharge.delete({ where: { id: chargeId } });
  revalidateTicket(charge.ticket_id);
  return { success: true };
}

/**
 * The vendor sent the work back. Records how it went, and the prices if they
 * are known by now — usually they are only known at this point.
 *
 * "Not repaired" needs a note: it is the sentence the customer will be told.
 */
export async function receiveExternalAction(chargeId: string, formData: FormData): Promise<Fail | Ok> {
  const charge = await db.ticketCharge.findUnique({
    where: { id: chargeId },
    select: { ticket_id: true, kind: true, sent_at: true, returned_at: true },
  });
  if (!charge || charge.kind !== "external_service") return { error: "Service eksternal tidak ditemukan." };
  const guard = await guardTicket(charge.ticket_id);
  if ("error" in guard) return guard;
  if (!charge.sent_at || charge.returned_at) return { error: "Pekerjaan ini sudah dicatat kembali dari vendor." };

  const result = String(formData.get("external_result") ?? "");
  if (!isExternalResult(result)) return { error: "Pilih hasil pengerjaan vendor." };
  const note = String(formData.get("external_note") ?? "").trim();
  if (result === "not_repaired" && !note) {
    return { error: "Tulis keterangan dari vendor bila tidak bisa diperbaiki." };
  }
  const prices = readPrices(formData, guard.perms);
  if ("error" in prices) return prices;

  // Conditional on still being at the vendor, so two people receiving the
  // same work at once record it once.
  const updated = await db.ticketCharge.updateMany({
    where: { id: chargeId, returned_at: null },
    data: {
      returned_at: new Date(),
      external_result: result,
      external_note: note || null,
      ...prices,
      updated_by_id: guard.userId,
    },
  });
  if (updated.count === 0) return { error: "Pekerjaan ini sudah dicatat kembali dari vendor." };

  revalidateTicket(charge.ticket_id);
  return { success: true };
}
