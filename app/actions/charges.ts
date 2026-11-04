"use server";

import { revalidatePath } from "next/cache";
import type { ChargeKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { chargePermissions } from "@/lib/charges-server";
import { CatalogUnavailableError, getCatalogItem } from "@/lib/catalog/hns-data";
import { readPartInput } from "@/lib/replaced-part-input";
import { deleteFromStorage } from "@/lib/r2";
import { logActivity, type ActivityActor } from "@/lib/activity";
import { isServicePart, requiresItemName } from "@/lib/service-parts";
import {
  chargeKindLabel,
  formatRupiah,
  MAX_CHARGE_QUANTITY,
  MAX_DESCRIPTION,
  isAddableChargeKind,
  isExternalResult,
  parseRupiah,
  partChargeDescription,
  vendorFitsCharge,
  vendorMismatchMessage,
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

async function guardTicket(
  ticketId: string,
): Promise<Fail | { userId: string; actor: ActivityActor; perms: ChargePermissions }> {
  const session = await requireSession();
  const ticket = await db.ticket.findUnique({ where: { id: ticketId }, select: TICKET_SCOPE });
  if (!ticket) return { error: "Tiket tidak ditemukan." };
  if (ticket.ticket_type !== "service") return { error: "Rincian biaya hanya ada pada tiket service." };
  const perms = await chargePermissions(session.userId, ticket);
  if (!perms.canEdit) return { error: "Anda tidak dapat mengubah rincian biaya tiket ini." };
  return { userId: session.userId, actor: session, perms };
}

/** "Jasa service: Ganti LCD ×1, harga jual Rp 350.000" — the cost is never written to the log. */
function lineText(kind: ChargeKind, description: string, quantity: number, unitPrice?: number | null): string {
  const price = typeof unitPrice === "number" ? `, harga jual ${formatRupiah(unitPrice)}` : "";
  return `${chargeKindLabel(kind)}: ${description} ×${quantity}${price}`;
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
  const vendor = await db.vendor.findUnique({
    where: { id },
    select: { supplies_parts: true, repairs: true, is_active: true },
  });
  if (!vendor || !vendor.is_active) return { error: "Vendor tidak ditemukan atau sudah nonaktif." };
  if (!vendorFitsCharge(kind, vendor)) return { error: vendorMismatchMessage(kind) };
  return { vendor_id: id };
}

/**
 * The job a "Jasa service" line is for, picked from the Daftar Jasa. A job
 * already on the line may stay after it was deactivated; choosing one anew
 * requires an active one.
 */
async function readServiceJob(
  formData: FormData,
  current: string | null,
): Promise<Fail | { id: string; name: string; default_price: number | null; points: number } | undefined> {
  if (!formData.has("service_job_id")) return undefined;
  const id = String(formData.get("service_job_id") ?? "").trim();
  if (!id) return { error: "Pilih jasa dari Daftar Jasa." };
  const job = await db.serviceJob.findUnique({
    where: { id },
    select: { id: true, name: true, default_price: true, points: true, is_active: true },
  });
  if (!job || (!job.is_active && id !== current)) {
    return { error: "Jasa tidak ditemukan atau sudah nonaktif di Daftar Jasa." };
  }
  return job;
}

/**
 * Add a line by hand: the shop's labour, work sent to a vendor, or anything
 * else. Adding external work IS sending it — the line is created at the vendor.
 *
 * The shop's labour is picked from the Daftar Jasa, never typed: that is what
 * a technician's month is counted by. Its name becomes the line's description,
 * its points are kept on the line, and its default price is used unless
 * someone allowed to set prices sent one.
 */
export async function addChargeAction(formData: FormData): Promise<Fail | Ok> {
  const ticketId = String(formData.get("ticket_id") ?? "");
  const guard = await guardTicket(ticketId);
  if ("error" in guard) return guard;

  const kind = String(formData.get("kind") ?? "");
  if (!isAddableChargeKind(kind)) {
    return { error: "Baris part dibuat dari panel Part yang Diganti." };
  }
  let job: Awaited<ReturnType<typeof readServiceJob>> = undefined;
  if (kind === "service_fee") {
    job = await readServiceJob(formData, null);
    if (!job) return { error: "Pilih jasa dari Daftar Jasa." };
    if ("error" in job) return job;
  }
  const description = job ? job.name : readDescription(formData);
  if (typeof description !== "string") return description;
  const quantity = readQuantity(formData);
  if (typeof quantity !== "number") return quantity;
  const prices = readPrices(formData, guard.perms);
  if ("error" in prices) return prices;
  if (job && prices.unit_price === undefined) prices.unit_price = job.default_price;
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
      service_job_id: job?.id ?? null,
      job_points: job?.points ?? null,
      ...prices,
      sent_at: kind === "external_service" ? new Date() : null,
      external_note: kind === "external_service" ? String(formData.get("external_note") ?? "").trim() || null : null,
      created_by_id: guard.userId,
    },
  });
  await logActivity(guard.actor, "charge.add", `Menambah biaya ${lineText(kind, description, quantity, prices.unit_price)}.`, {
    type: "ticket",
    id: ticketId,
  });

  revalidateTicket(ticketId);
  return { success: true };
}

/**
 * Add a fitted part from Rincian Biaya — for whoever may change the bill, an
 * administrator included, not only the technician holding the ticket.
 *
 * It records exactly what the "Part yang Diganti" panel records: the part, and
 * its line of the bill created with it, so the two cannot disagree. Here the
 * line can carry its prices and supplier at once. Photos stay with the panel.
 * A part typed by hand because Accurate has not received it yet gets its code
 * later through `linkPartCatalogAction`.
 */
export async function addPartChargeAction(formData: FormData): Promise<Fail | Ok> {
  const ticketId = String(formData.get("ticket_id") ?? "");
  const guard = await guardTicket(ticketId);
  if ("error" in guard) return guard;

  const input = await readPartInput(formData);
  if ("error" in input) return input;
  const prices = readPrices(formData, guard.perms);
  if ("error" in prices) return prices;
  const vendor = await readVendor(formData, "part", null);
  if (vendor && "error" in vendor) return vendor;

  await db.ticketReplacedPart.create({
    data: {
      ticket_id: ticketId,
      part: input.part,
      item_name: input.name,
      notes: String(formData.get("notes") ?? "").trim() || null,
      catalog_item_id: input.catalog?.id ?? null,
      sku: input.catalog?.sku ?? null,
      catalog_category: input.catalog?.category ?? null,
      quantity: input.quantity,
      recorded_by_id: guard.userId,
      charge: {
        create: {
          ticket_id: ticketId,
          kind: "part",
          description: partChargeDescription(input.part, input.name),
          quantity: input.quantity,
          vendor_id: vendor?.vendor_id ?? null,
          ...prices,
          created_by_id: guard.userId,
        },
      },
    },
  });
  await logActivity(
    guard.actor,
    "part.add",
    `Mencatat part dari Rincian Biaya: ${lineText("part", partChargeDescription(input.part, input.name), input.quantity, prices.unit_price)}${
      input.catalog?.sku ? ` (kode ${input.catalog.sku})` : " (belum ada kode Accurate)"
    }.`,
    { type: "ticket", id: ticketId },
  );

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
    select: {
      ticket_id: true,
      kind: true,
      description: true,
      quantity: true,
      vendor_id: true,
      service_job_id: true,
      replaced_part: { select: { id: true, part: true, item_name: true, sku: true } },
    },
  });
  if (!charge) return { error: "Baris biaya tidak ditemukan." };
  const guard = await guardTicket(charge.ticket_id);
  if ("error" in guard) return guard;

  const data: Prisma.TicketChargeUncheckedUpdateInput = { updated_by_id: guard.userId };
  // A part line's quantity — and, until it has its Accurate code, its category
  // and name — belong to the part. They are written to the part and mirrored
  // on the line, so the two never disagree. Once linked, the name is the
  // catalogue's and stays.
  let partUpdate: Prisma.TicketReplacedPartUpdateInput | null = null;
  const part = charge.replaced_part;
  if (part) {
    partUpdate = {};
    if (formData.has("quantity")) {
      const quantity = readQuantity(formData);
      if (typeof quantity !== "number") return quantity;
      partUpdate.quantity = quantity;
      data.quantity = quantity;
    }
    if (!part.sku && (formData.has("part") || formData.has("item_name"))) {
      const category = formData.has("part") ? String(formData.get("part")) : part.part;
      if (!isServicePart(category)) return { error: "Jenis part tidak dikenal." };
      const name = formData.has("item_name")
        ? String(formData.get("item_name") ?? "").trim().replace(/\s+/g, " ") || null
        : part.item_name;
      if (name && name.length > MAX_DESCRIPTION) return { error: `Nama barang maksimal ${MAX_DESCRIPTION} karakter.` };
      if (requiresItemName(category) && !name) return { error: "Nama barang wajib diisi bila jenis part-nya Lainnya." };
      partUpdate.part = category;
      partUpdate.item_name = name;
      data.description = partChargeDescription(category, name);
    }
  }
  // A labour line names its job. Choosing another one renames the line and
  // gives it that job's points; keeping the same one keeps the points it had.
  let newJobPrice: number | null | undefined;
  if (charge.kind === "service_fee") {
    const job = await readServiceJob(formData, charge.service_job_id);
    if (job && "error" in job) return job;
    if (job && job.id !== charge.service_job_id) {
      data.service_job_id = job.id;
      data.description = job.name;
      data.job_points = job.points;
      newJobPrice = job.default_price;
    }
  }
  if (charge.kind !== "part") {
    // Typed only on lines that are not a job from the list.
    if (formData.has("description") && !(charge.kind === "service_fee" && (data.service_job_id || charge.service_job_id))) {
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
  // Another job without a price sent — someone who may not set prices — takes
  // that job's default, rather than keeping the old job's price under a new name.
  if (newJobPrice !== undefined && prices.unit_price === undefined) prices.unit_price = newJobPrice;
  Object.assign(data, prices);
  const vendor = await readVendor(formData, charge.kind, charge.vendor_id);
  if (vendor && "error" in vendor) return vendor;
  if (vendor) data.vendor_id = vendor.vendor_id;

  const renames = partUpdate !== null && "item_name" in partUpdate;
  const saved = await db.$transaction(async (tx) => {
    if (part && partUpdate && Object.keys(partUpdate).length > 0) {
      // A rename only while the part has no code: someone may have linked it
      // since this form was opened, and the catalogue's name must win.
      const written = await tx.ticketReplacedPart.updateMany({
        where: renames ? { id: part.id, sku: null } : { id: part.id },
        data: partUpdate as Prisma.TicketReplacedPartUpdateManyMutationInput,
      });
      if (written.count === 0) return false;
    }
    await tx.ticketCharge.update({ where: { id: chargeId }, data });
    return true;
  });
  if (!saved) return { error: "Part ini baru saja diberi kode Accurate. Muat ulang halaman, lalu coba lagi." };
  const changed = [
    typeof data.description === "string" && data.description !== charge.description && `nama → ${data.description}`,
    typeof data.quantity === "number" && data.quantity !== charge.quantity && `jumlah → ${data.quantity}`,
    "unit_price" in prices && `harga jual → ${prices.unit_price === null || prices.unit_price === undefined ? "kosong" : formatRupiah(prices.unit_price)}`,
    "unit_cost" in prices && "harga modal diubah",
    vendor && vendor.vendor_id !== charge.vendor_id && "vendor diganti",
  ].filter(Boolean);
  await logActivity(
    guard.actor,
    "charge.update",
    `Mengubah biaya ${chargeKindLabel(charge.kind)}: ${charge.description}${changed.length ? ` (${changed.join(", ")})` : ""}.`,
    { type: "ticket", id: charge.ticket_id },
  );
  revalidateTicket(charge.ticket_id);
  return { success: true };
}

/** Remove a line added by hand. A part line goes when its part is removed. */
export async function removeChargeAction(chargeId: string): Promise<Fail | Ok> {
  const charge = await db.ticketCharge.findUnique({
    where: { id: chargeId },
    select: { ticket_id: true, replaced_part_id: true, kind: true, description: true, quantity: true },
  });
  if (!charge) return { error: "Baris biaya tidak ditemukan." };
  const guard = await guardTicket(charge.ticket_id);
  if ("error" in guard) return guard;

  if (charge.replaced_part_id) {
    // A part line is the part: removing it removes the part, its line and its
    // photo rows by cascade. The files in the bucket do not cascade, so they go
    // here — best effort and after the delete, so a storage error never makes
    // a completed removal look like it failed (removeReplacedPartAction's rule).
    const photos = await db.ticketReplacedPartPhoto.findMany({
      where: { part_id: charge.replaced_part_id },
      select: { file_url: true },
    });
    await db.ticketReplacedPart.delete({ where: { id: charge.replaced_part_id } });
    for (const photo of photos) {
      if (!(await deleteFromStorage(photo.file_url))) {
        console.error(`[removeChargeAction] berkas tertinggal: ${photo.file_url}`);
      }
    }
  } else {
    await db.ticketCharge.delete({ where: { id: chargeId } });
  }
  await logActivity(
    guard.actor,
    charge.replaced_part_id ? "part.remove" : "charge.remove",
    `Menghapus biaya ${lineText(charge.kind, charge.description, charge.quantity)}.`,
    { type: "ticket", id: charge.ticket_id },
  );
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
    select: { ticket_id: true, kind: true, description: true, sent_at: true, returned_at: true, vendor: { select: { name: true } } },
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
  await logActivity(
    guard.actor,
    "charge.receive_external",
    `Menerima kembali service eksternal "${charge.description}"${charge.vendor ? ` dari ${charge.vendor.name}` : ""}: ${
      result === "repaired" ? "berhasil diperbaiki" : "tidak bisa diperbaiki"
    }${note ? ` (${note})` : ""}.`,
    { type: "ticket", id: charge.ticket_id },
  );

  revalidateTicket(charge.ticket_id);
  return { success: true };
}

/**
 * Give a part typed by hand its Accurate code, once the item has been received
 * there. Receiving often lags the repair, so a part is first recorded under a
 * plain name ("Baterai") and linked later; the catalogue's name then replaces
 * the typed one, on the part and on its line of the bill. Prices, quantity and
 * photos are left alone.
 *
 * Only a part with no code yet — a wrong link is not overwritten from here —
 * and conditionally, so two people linking at once record one item.
 */
export async function linkPartCatalogAction(chargeId: string, catalogItemId: number): Promise<Fail | Ok> {
  const session = await requireSession();
  const charge = await db.ticketCharge.findUnique({
    where: { id: chargeId },
    select: {
      ticket_id: true,
      ticket: { select: TICKET_SCOPE },
      replaced_part: { select: { id: true, part: true, sku: true } },
    },
  });
  const part = charge?.replaced_part;
  if (!charge || !part) return { error: "Part tidak ditemukan." };
  if (charge.ticket.ticket_type !== "service") return { error: "Rincian biaya hanya ada pada tiket service." };
  const perms = await chargePermissions(session.userId, charge.ticket);
  if (!perms.canLinkPartCode) return { error: "Anda tidak dapat mengubah part pada tiket ini." };
  if (part.sku) return { error: "Part ini sudah punya kode Accurate." };

  if (!Number.isInteger(catalogItemId) || catalogItemId <= 0) return { error: "Barang katalog tidak valid." };
  // Re-read by id, so the code and name on record are the catalogue's and not
  // whatever the browser sent.
  let item;
  try {
    item = await getCatalogItem(catalogItemId);
  } catch (err) {
    if (!(err instanceof CatalogUnavailableError)) throw err;
    console.error("[LINK PART CODE]", err.message);
    return { error: "Katalog barang sedang tidak dapat dihubungi. Coba lagi nanti." };
  }
  if (!item) return { error: "Barang tidak ditemukan di katalog." };

  const linked = await db.$transaction(async (tx) => {
    const updated = await tx.ticketReplacedPart.updateMany({
      where: { id: part.id, sku: null },
      data: { catalog_item_id: item.id, sku: item.sku, catalog_category: item.category, item_name: item.name },
    });
    if (updated.count === 0) return false;
    await tx.ticketCharge.update({
      where: { id: chargeId },
      data: { description: partChargeDescription(part.part, item.name), updated_by_id: session.userId },
    });
    return true;
  });
  if (!linked) return { error: "Part ini sudah punya kode Accurate." };
  await logActivity(session, "part.link_code", `Mengisi kode Accurate part: ${item.sku} — ${item.name}.`, {
    type: "ticket",
    id: charge.ticket_id,
  });

  revalidateTicket(charge.ticket_id);
  return { success: true };
}
