/**
 * Integration tests for the replaced-part actions.
 *
 * Runs against the local MariaDB container; vitest.setup.ts refuses any
 * non-local DATABASE_URL. Fixtures are namespaced per run and removed in
 * afterAll — by email prefix, not by a hand-kept id list, which is how
 * rma.test.ts leaked eleven users before 2026-10-03.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock("@/lib/email", () => ({
  sendTicketStatusEmail: vi.fn(async () => undefined),
  EMAIL_MILESTONES: [],
}));

vi.mock("@/lib/r2", () => ({
  uploadToR2: vi.fn(async () => "https://r2.test/x.jpg"),
  deleteFromStorage: vi.fn(async () => true),
  getFileType: () => "image",
  getExt: () => "jpg",
}));

const session = { userId: "", role: "Technician", name: "Test Tech" };
vi.mock("@/lib/session", () => ({
  requireSession: async () => session,
  getSession: async () => session,
  requireRole: async (...roles: string[]) => {
    if (!roles.includes(session.role)) throw new Error("Unauthorized");
    return session;
  },
}));

const { db } = await import("@/lib/db");
const { addReplacedPartAction, removeReplacedPartAction } = await import("./technician");
const { MAX_PART_PHOTOS } = await import("@/lib/service-parts");

const RUN = `parttest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
let technicianId: string;
let otherTechnicianId: string;

/**
 * The action takes FormData because it carries photos. The tests call it
 * through this so each case still reads as its arguments.
 */
async function addPart(
  ticketId: string,
  part: string,
  itemName = "",
  notes = "",
  photos: File[] = []
) {
  const formData = new FormData();
  formData.append("ticket_id", ticketId);
  formData.append("part", part);
  formData.append("item_name", itemName);
  formData.append("notes", notes);
  for (const photo of photos) formData.append("photos", photo);
  return addReplacedPartAction(formData);
}

/** A tiny file that is a real File with a real MIME type. */
function fakeFile(name: string, type: string) {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type });
}

async function makeTicket(
  opts: { type?: "service" | "cleaning"; owner?: string } = {}
) {
  return db.ticket.create({
    data: {
      ticket_code: `${RUN}_${Math.random().toString(36).slice(2, 10)}`,
      ticket_type: opts.type ?? "service",
      device_type: "Laptop_Gaming",
      status: "on_progress",
      technician_id: opts.owner ?? technicianId,
      pickup_method: "self_pickup",
    },
    select: { id: true, ticket_code: true },
  });
}

beforeAll(async () => {
  const [tech, other] = await Promise.all([
    db.user.create({
      data: {
        name: `${RUN} tech`,
        email: `${RUN}.tech@test.local`,
        phone_number: "+628100000021",
        address: "Test",
        role: "Technician",
        password: "x",
      },
      select: { id: true },
    }),
    db.user.create({
      data: {
        name: `${RUN} other`,
        email: `${RUN}.other@test.local`,
        phone_number: "+628100000022",
        address: "Test",
        role: "Technician",
        password: "x",
      },
      select: { id: true },
    }),
  ]);
  technicianId = tech.id;
  otherTechnicianId = other.id;
});

beforeEach(() => {
  session.userId = technicianId;
  session.role = "Technician";
});

afterAll(async () => {
  const tickets = await db.ticket.findMany({
    where: { ticket_code: { startsWith: RUN } },
    select: { id: true },
  });
  const ids = tickets.map((t) => t.id);
  if (ids.length > 0) await db.ticket.deleteMany({ where: { id: { in: ids } } });
  await db.user.deleteMany({ where: { email: { startsWith: RUN } } });
});

describe("addReplacedPartAction — what it accepts", () => {
  it("records a named part with its item name", async () => {
    const ticket = await makeTicket();

    const result = await addPart(ticket.id,
      "battery",
      "ASUS C31N1915",
      "Baterai lama kembung");

    expect(result.success).toBe(true);
    const rows = await db.ticketReplacedPart.findMany({ where: { ticket_id: ticket.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].part).toBe("battery");
    expect(rows[0].item_name).toBe("ASUS C31N1915");
    expect(rows[0].notes).toBe("Baterai lama kembung");
    expect(rows[0].recorded_by_id).toBe(technicianId);
  });

  it("accepts a named part with no item name — a generic fan has nothing to type", async () => {
    const ticket = await makeTicket();

    const result = await addPart(ticket.id, "fan", "", "");

    expect(result.success).toBe(true);
    const row = await db.ticketReplacedPart.findFirst({ where: { ticket_id: ticket.id } });
    expect(row!.item_name).toBeNull();
    expect(row!.notes).toBeNull();
  });

  it("records several parts on one ticket", async () => {
    const ticket = await makeTicket();

    await addPart(ticket.id, "lcd", "LP156WFC", "");
    await addPart(ticket.id, "keyboard", "", "");
    await addPart(ticket.id, "battery", "C31N1915", "");

    const rows = await db.ticketReplacedPart.findMany({ where: { ticket_id: ticket.id } });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.part).sort()).toEqual(["battery", "keyboard", "lcd"]);
  });

  it("trims whitespace rather than storing it", async () => {
    const ticket = await makeTicket();

    await addPart(ticket.id, "ram", "   8GB DDR4   ", "   catatan   ");

    const row = await db.ticketReplacedPart.findFirst({ where: { ticket_id: ticket.id } });
    expect(row!.item_name).toBe("8GB DDR4");
    expect(row!.notes).toBe("catatan");
  });

  it("stores a whitespace-only name as nothing, not as spaces", async () => {
    const ticket = await makeTicket();

    await addPart(ticket.id, "speaker", "    ", "");

    const row = await db.ticketReplacedPart.findFirst({ where: { ticket_id: ticket.id } });
    expect(row!.item_name).toBeNull();
  });
});

describe("addReplacedPartAction — what it refuses", () => {
  it("refuses a part that is not in the schema, so a hand-posted form cannot invent one", async () => {
    const ticket = await makeTicket();

    for (const bogus of ["cpu", "LCD", "baterai", "", "'; drop table"]) {
      const result = await addPart(ticket.id, bogus, "x", "");
      expect(result.error).toBe("Jenis part tidak dikenal.");
    }
    expect(await db.ticketReplacedPart.count({ where: { ticket_id: ticket.id } })).toBe(0);
  });

  it("demands an item name when the part is `other`, which says nothing by itself", async () => {
    const ticket = await makeTicket();

    const refused = await addPart(ticket.id, "other", "   ", "");
    expect(refused.error).toContain("Nama barang wajib diisi");

    const accepted = await addPart(ticket.id, "other", "Engsel layar", "");
    expect(accepted.success).toBe(true);
  });

  it("refuses a ticket type that is not service", async () => {
    const ticket = await makeTicket({ type: "cleaning" });

    const result = await addPart(ticket.id, "lcd", "", "");

    expect(result.error).toBe("Penggantian part hanya dicatat pada tiket service.");
    expect(await db.ticketReplacedPart.count({ where: { ticket_id: ticket.id } })).toBe(0);
  });

  it("refuses a technician who does not hold the ticket", async () => {
    const ticket = await makeTicket({ owner: otherTechnicianId });

    const result = await addPart(ticket.id, "lcd", "", "");

    expect(result.error).toContain("Hanya teknisi yang memegang tiket ini");
    expect(await db.ticketReplacedPart.count({ where: { ticket_id: ticket.id } })).toBe(0);
  });

  it("refuses anyone who is not a technician", async () => {
    const ticket = await makeTicket();
    session.role = "Administrator";

    await expect(addPart(ticket.id, "lcd")).rejects.toThrow("Unauthorized");
  });

  it("reports a missing ticket instead of throwing", async () => {
    const result = await addPart("tidak-ada", "lcd", "", "");
    expect(result.error).toBe("Tiket tidak ditemukan.");
  });
});

describe("removeReplacedPartAction", () => {
  it("removes an entry the same technician recorded", async () => {
    const ticket = await makeTicket();
    await addPart(ticket.id, "lcd", "LP156", "");
    const row = await db.ticketReplacedPart.findFirst({ where: { ticket_id: ticket.id } });

    const result = await removeReplacedPartAction(row!.id);

    expect(result.success).toBe(true);
    expect(await db.ticketReplacedPart.count({ where: { ticket_id: ticket.id } })).toBe(0);
  });

  it("refuses to delete a colleague's entry found by guessing an id", async () => {
    const ticket = await makeTicket();
    await addPart(ticket.id, "lcd", "LP156", "");
    const row = await db.ticketReplacedPart.findFirst({ where: { ticket_id: ticket.id } });

    // The other technician is a technician too, and knows the id.
    session.userId = otherTechnicianId;
    const result = await removeReplacedPartAction(row!.id);

    expect(result.error).toContain("Hanya teknisi yang mencatatnya");
    expect(await db.ticketReplacedPart.count({ where: { ticket_id: ticket.id } })).toBe(1);
  });

  it("reports a missing entry instead of throwing", async () => {
    const result = await removeReplacedPartAction("tidak-ada");
    expect(result.error).toBe("Catatan part tidak ditemukan.");
  });
});

describe("the ticket owns its parts", () => {
  it("takes the parts with it when the ticket is deleted", async () => {
    const ticket = await makeTicket();
    await addPart(ticket.id, "lcd", "LP156", "");
    expect(await db.ticketReplacedPart.count({ where: { ticket_id: ticket.id } })).toBe(1);

    await db.ticket.delete({ where: { id: ticket.id } });

    // onDelete: Cascade — no orphan row pointing at a ticket that is gone.
    expect(await db.ticketReplacedPart.count({ where: { ticket_id: ticket.id } })).toBe(0);
  });
});

describe("photos of the fitted part", () => {
  it("stores every photo against the part, not against the ticket", async () => {
    const ticket = await makeTicket();

    const result = await addPart(ticket.id, "battery", "ASUS C31N1915", "", [
      fakeFile("dus.jpg", "image/jpeg"),
      fakeFile("label.jpg", "image/jpeg"),
    ]);

    expect(result.success).toBe(true);
    const row = await db.ticketReplacedPart.findFirst({
      where: { ticket_id: ticket.id },
      include: { photos: true },
    });
    // Two photos on THIS part — a ticket-level attachment could not say which
    // of several replaced components it pictured.
    expect(row!.photos).toHaveLength(2);
    expect(row!.photos.every((p) => p.file_url.length > 0)).toBe(true);
  });

  it("accepts a part with no photo — not every swap has a box", async () => {
    const ticket = await makeTicket();

    const result = await addPart(ticket.id, "fan");

    expect(result.success).toBe(true);
    const row = await db.ticketReplacedPart.findFirst({
      where: { ticket_id: ticket.id },
      include: { photos: true },
    });
    expect(row!.photos).toHaveLength(0);
  });

  it("refuses more photos than the limit", async () => {
    const ticket = await makeTicket();
    const tooMany = Array.from({ length: MAX_PART_PHOTOS + 1 }, (_, i) =>
      fakeFile(`foto${i}.jpg`, "image/jpeg")
    );

    const result = await addPart(ticket.id, "lcd", "", "", tooMany);

    expect(result.error).toContain(`Maksimal ${MAX_PART_PHOTOS} foto`);
    expect(await db.ticketReplacedPart.count({ where: { ticket_id: ticket.id } })).toBe(0);
  });

  it("refuses anything that is not an image", async () => {
    const ticket = await makeTicket();

    for (const bad of [
      fakeFile("klip.mp4", "video/mp4"),
      fakeFile("nota.pdf", "application/pdf"),
    ]) {
      const result = await addPart(ticket.id, "lcd", "", "", [bad]);
      expect(result.error).toBe("Foto part harus berupa gambar.");
    }
    expect(await db.ticketReplacedPart.count({ where: { ticket_id: ticket.id } })).toBe(0);
  });

  it("takes the photo rows with the part when it is removed", async () => {
    const ticket = await makeTicket();
    await addPart(ticket.id, "keyboard", "", "", [fakeFile("dus.jpg", "image/jpeg")]);
    const row = await db.ticketReplacedPart.findFirst({ where: { ticket_id: ticket.id } });
    expect(await db.ticketReplacedPartPhoto.count({ where: { part_id: row!.id } })).toBe(1);

    await removeReplacedPartAction(row!.id);

    expect(await db.ticketReplacedPartPhoto.count({ where: { part_id: row!.id } })).toBe(0);
  });
});
