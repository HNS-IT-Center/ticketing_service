import { db } from "@/lib/db";

/**
 * Next ticket code for a store, derived from the HIGHEST code that store has.
 *
 * It used to read the most recently *created* ticket and add one, which assumes
 * creation order matches numbering order. It does not have to. A row with a
 * backdated `created_at`, a clock difference between app instances, or a ticket
 * moved between stores is enough to leave a low number on the newest row — and
 * then the next code duplicates one that already exists and the insert dies
 * with P2002 on `Ticket_ticket_code_key`. Seen in the wild: a store holding
 * NGW-000001..000009 whose newest row was NGW-000003, so every new ticket tried
 * to be NGW-000004 forever.
 *
 * The fallback branch was worse still: it used `count + 1`, which collides
 * after any deletion at all.
 *
 * Codes are zero-padded to a fixed width, so ordering by the string orders by
 * the number. The lookup is by code prefix rather than by `store_location_id`,
 * because the uniqueness constraint is on the code: a ticket that was moved to
 * another store still occupies its old number. Same approach as
 * `allocateRmaCode()` in app/actions/rma.ts.
 */
export async function nextStoreTicketCode(storeCode: string): Promise<string> {
  const prefix = `${storeCode}-`;
  const highest = await db.ticket.findFirst({
    where: { ticket_code: { startsWith: prefix } },
    orderBy: { ticket_code: "desc" },
    select: { ticket_code: true },
  });

  const lastSeq = highest ? parseInt(highest.ticket_code.slice(prefix.length), 10) : 0;
  const next = Number.isNaN(lastSeq) ? 1 : lastSeq + 1;
  return `${prefix}${String(next).padStart(6, "0")}`;
}

/** A unique-constraint failure specifically on `ticket_code`, not on some other column. */
export function isTicketCodeCollision(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; message?: string; meta?: Record<string, unknown> };

  const isUniqueViolation =
    e.code === "P2002" || (e.message ?? "").includes("Unique constraint failed");
  if (!isUniqueViolation) return false;

  return `${JSON.stringify(e.meta ?? {})} ${e.message ?? ""}`.includes("ticket_code");
}
