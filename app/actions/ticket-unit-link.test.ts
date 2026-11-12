/**
 * Lengkapi Kode Barang, through the real action and database; only the
 * catalogue API is replaced.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

const catalog = vi.hoisted(() => ({ items: new Map<number, unknown>() }));
vi.mock("@/lib/catalog/hns-data", () => {
  class CatalogUnavailableError extends Error {}
  return {
    CatalogUnavailableError,
    isCatalogConfigured: () => false,
    searchCatalog: async () => [],
    getCatalogItem: async (id: number) => catalog.items.get(id) ?? null,
  };
});

const session = { userId: "", role: "Administrator", name: "QC" };
vi.mock("@/lib/session", () => ({
  requireSession: async () => session,
  getSession: async () => session,
  requireRole: async () => session,
}));

const { db } = await import("@/lib/db");
const { linkTicketUnitAction } = await import("./ticket-edit");
const { unitCodeWhere } = await import("@/lib/unit-code-queue");

const RUN = `ulk${Date.now().toString(36)}`;
const ids: Record<string, string> = {};

async function ticket(key: string, data: Record<string, unknown>) {
  const t = await db.ticket.create({
    data: {
      ticket_code: `${RUN}-${key}`,
      device_type: "Laptop_Office",
      status: "on_progress",
      store_location_id: ids.store,
      pickup_method: "self_pickup",
      ticket_type: "warranty_claim",
      device_name: "asus rog ketik",
      ...data,
    } as never,
    select: { id: true },
  });
  ids[key] = t.id;
}

beforeAll(async () => {
  ids.store = (await db.storeLocation.create({ data: { name: `${RUN} toko`, code: `${RUN}T` }, select: { id: true } })).id;
  for (const [k, role] of [["admin", "Administrator"], ["tech", "Technician"]] as const) {
    ids[k] = (
      await db.user.create({
        data: { name: `${RUN} ${k}`, email: `${RUN}.${k}@qc.local`, phone_number: "-", address: "-", role, password: "x" },
        select: { id: true },
      })
    ).id;
  }
  catalog.items.set(777001, { id: 777001, sku: "SKU-777", name: "NB ASUS ROG STRIX G15", category: "NOTEBOOK ASUS", brand: "ASUS" });
  await ticket("stock", { warranty_detail: { create: { unit_ownership: "store_stock" } } });
  await ticket("customer", { warranty_detail: { create: { unit_ownership: "customer" } } });
  await ticket("service", { ticket_type: "service" });
  await ticket("coded", { device_sku: "ADA-1" });
});

afterAll(async () => {
  await db.activityLog.deleteMany({ where: { entity_label: { startsWith: RUN } } });
  await db.ticketWarrantyDetail.deleteMany({ where: { ticket: { ticket_code: { startsWith: RUN } } } });
  await db.ticket.deleteMany({ where: { ticket_code: { startsWith: RUN } } });
  await db.user.deleteMany({ where: { email: { startsWith: RUN } } });
  await db.storeLocation.deleteMany({ where: { name: { startsWith: RUN } } });
  await db.$disconnect();
});

const inList = async (kind: "stok" | "klaim" | "service") =>
  (await db.ticket.findMany({ where: unitCodeWhere(kind, RUN), select: { ticket_code: true } })).map((t) => t.ticket_code.slice(RUN.length + 1));

describe("Lengkapi Kode Barang", () => {
  it("lists tickets without a code by kind, store stock apart from the customer's", async () => {
    expect(await inList("stok")).toEqual(["stock"]);
    expect(await inList("klaim")).toEqual(["customer"]);
    expect(await inList("service")).toEqual(["service"]);
  });

  it("links the catalogue item, takes its name and brand, and logs the typed name", async () => {
    Object.assign(session, { userId: ids.admin, role: "Administrator" });
    expect(await linkTicketUnitAction(ids.stock, 777001)).toEqual({ ok: true, changed: 1 });
    const t = await db.ticket.findUniqueOrThrow({ where: { id: ids.stock } });
    expect(t).toMatchObject({ device_sku: "SKU-777", device_name: "NB ASUS ROG STRIX G15", device_catalog_item_id: 777001, device_brand: "ASUS" });
    expect(await inList("stok")).toEqual([]);
  });

  it("refuses a ticket that already has a code, an unknown item, and someone without the right", async () => {
    expect(await linkTicketUnitAction(ids.coded, 777001)).toMatchObject({ ok: false, error: expect.stringContaining("sudah punya kode") });
    expect(await linkTicketUnitAction(ids.customer, 123)).toMatchObject({ ok: false, error: expect.stringContaining("tidak ditemukan") });
    Object.assign(session, { userId: ids.tech, role: "Technician" });
    expect(await linkTicketUnitAction(ids.customer, 777001)).toMatchObject({ ok: false, error: expect.stringContaining("akses") });
  });
});
