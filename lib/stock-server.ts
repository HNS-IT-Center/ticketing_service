import "server-only";
import type { TicketStatus, TicketType } from "@prisma/client";
import { db } from "@/lib/db";
import { ticketPartyName } from "@/lib/ticket-party";
import { daysSince, enteredStatusAt } from "@/lib/store-followups";
import { servicePartLabel } from "@/lib/service-parts";
import { buildStageOf, type BuildStage, type OutgoingKind } from "@/lib/stock";

export type BuildRow = {
  ticketId: string;
  code: string;
  status: TicketStatus;
  stage: BuildStage;
  store: string | null;
  customer: string;
  technician: string | null;
  sales: string | null;
  quoteCode: string | null;
  components: number;
  /** Who ticked the quotation against what was brought in, at intake. */
  intakeCheck: { by: string | null; at: Date } | null;
  photos: { url: string; title: string }[];
  /** Days in the current status. */
  days: number;
  createdAt: Date;
};

/**
 * Every PC build that is not cancelled or rejected, newest first, with where
 * it stands — read only. Photos are the components photographed at intake
 * and the technician's photo of the finished build.
 */
export async function loadBuilds(storeId: string | undefined, now: number): Promise<BuildRow[]> {
  const tickets = await db.ticket.findMany({
    where: {
      ticket_type: "pc_build",
      status: { notIn: ["cancelled", "rejected"] },
      ...(storeId ? { store_location_id: storeId } : {}),
    },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      ticket_code: true,
      ticket_type: true,
      status: true,
      created_at: true,
      updated_at: true,
      store_location: { select: { name: true } },
      technician: { select: { name: true } },
      sales: { select: { name: true } },
      is_for_self: true,
      customer_name: true,
      user: { select: { name: true } },
      pc_build_detail: { select: { quote_code: true, verified_at: true, verified_by_name: true, first_build_url: true } },
      _count: { select: { pc_components: true } },
      attachments: { where: { kind: "build_photo" }, orderBy: { created_at: "asc" }, select: { file_url: true } },
      status_logs: { select: { new_status: true, created_at: true } },
    },
  });

  return tickets.flatMap((t) => {
    const stage = buildStageOf(t.status);
    if (!stage) return [];
    const d = t.pc_build_detail;
    const photos = [
      ...t.attachments.map((a, i) => ({ url: a.file_url, title: `Foto komponen saat masuk ${i + 1}` })),
      ...(d?.first_build_url ? [{ url: d.first_build_url, title: "Foto rakitan selesai" }] : []),
    ];
    return [
      {
        ticketId: t.id,
        code: t.ticket_code,
        status: t.status,
        stage,
        store: t.store_location?.name ?? null,
        customer: ticketPartyName(t) ?? "—",
        technician: t.technician?.name ?? null,
        sales: t.sales?.name ?? null,
        quoteCode: d?.quote_code ?? null,
        components: t._count.pc_components,
        intakeCheck: d?.verified_at ? { by: d.verified_by_name, at: d.verified_at } : null,
        photos,
        days: daysSince(enteredStatusAt(t.status, t.status_logs, t.created_at), now),
        createdAt: t.created_at,
      },
    ];
  });
}

export type OutgoingRow = {
  key: string;
  kind: OutgoingKind;
  ticketId: string;
  code: string;
  ticketType: TicketType;
  status: TicketStatus;
  store: string | null;
  technician: string | null;
  at: Date;
  /** "Baterai", "RAM", the quotation's group — what kind of thing it is. */
  category: string;
  name: string;
  sku: string | null;
  quantity: number;
  photos: { url: string; title: string }[];
};

export type OutgoingFilter = {
  start: Date;
  end: Date;
  storeId?: string;
  kind?: OutgoingKind;
  q?: string;
  /** Only parts still without an Accurate code. */
  uncoded?: boolean;
};

/**
 * Every part that went out on a ticket in the period, newest first, from the
 * three places they are recorded:
 *
 *   service  replaced parts (TicketReplacedPart), dated when recorded, with
 *            their own photos;
 *   upgrade  items fitted on an upgrade ticket, dated with the ticket;
 *   pc_build components of a build, dated with the ticket, with the build's
 *            photos (intake and finished).
 *
 * Cancelled and rejected tickets are left out — nothing went out on them.
 */
export async function loadOutgoingParts(f: OutgoingFilter): Promise<OutgoingRow[]> {
  const ticketWhere = {
    status: { notIn: ["cancelled", "rejected"] as TicketStatus[] },
    ...(f.storeId ? { store_location_id: f.storeId } : {}),
  };
  const inPeriod = { gte: f.start, lt: f.end };
  const q = f.q?.trim();
  const uncoded = f.uncoded ? { OR: [{ sku: null }, { sku: "" }] } : {};
  const TICKET = {
    id: true,
    ticket_code: true,
    ticket_type: true,
    status: true,
    created_at: true,
    store_location: { select: { name: true } },
    technician: { select: { name: true } },
  } as const;

  const want = (k: OutgoingKind) => !f.kind || f.kind === k;
  const [service, upgrade, build] = await Promise.all([
    want("service")
      ? db.ticketReplacedPart.findMany({
          where: {
            created_at: inPeriod,
            ticket: ticketWhere,
            ...uncoded,
            ...(q ? { OR: [{ item_name: { contains: q } }, { sku: { contains: q } }, { ticket: { ticket_code: { contains: q } } }] } : {}),
          },
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            part: true,
            item_name: true,
            sku: true,
            quantity: true,
            created_at: true,
            photos: { orderBy: { created_at: "asc" }, select: { file_url: true } },
            ticket: { select: TICKET },
          },
        })
      : [],
    want("upgrade")
      ? db.ticketUpgradeDetail.findMany({
          where: {
            ticket: { ...ticketWhere, created_at: inPeriod, ...(q ? { OR: [{ ticket_code: { contains: q } }] } : {}) },
            ...uncoded,
          },
          select: { id: true, item_name: true, sku: true, quantity: true, upgrade: { select: { name: true } }, ticket: { select: TICKET } },
        })
      : [],
    want("pc_build")
      ? db.ticketPcBuildComponent.findMany({
          where: {
            ticket: { ...ticketWhere, created_at: inPeriod },
            ...uncoded,
            ...(q
              ? { OR: [{ component_name: { contains: q } }, { sku: { contains: q } }, { ticket: { ticket_code: { contains: q } } }] }
              : {}),
          },
          orderBy: { id: "asc" },
          select: {
            id: true,
            component_name: true,
            quote_label: true,
            catalog_category: true,
            sku: true,
            quantity: true,
            ticket: { select: TICKET },
          },
        })
      : [],
  ]);

  // An upgrade's search has to look at the item too, and the item name is
  // optional with the upgrade type as its fallback — simplest done here.
  const upgradeRows = q
    ? upgrade.filter((u) => [u.item_name, u.sku, u.upgrade.name, u.ticket.ticket_code].some((v) => v?.toLowerCase().includes(q.toLowerCase())))
    : upgrade;

  // A build's photos: the components at intake and the finished build.
  const buildTicketIds = [...new Set(build.map((b) => b.ticket.id))];
  const [intakePhotos, finished] = buildTicketIds.length
    ? await Promise.all([
        db.ticketAttachment.findMany({
          where: { ticket_id: { in: buildTicketIds }, kind: "build_photo" },
          orderBy: { created_at: "asc" },
          select: { ticket_id: true, file_url: true },
        }),
        db.ticketPcBuildDetail.findMany({
          where: { ticket_id: { in: buildTicketIds }, first_build_url: { not: null } },
          select: { ticket_id: true, first_build_url: true },
        }),
      ])
    : [[], []];
  const buildPhotos = new Map<string, { url: string; title: string }[]>();
  const push = (id: string, p: { url: string; title: string }) => buildPhotos.set(id, [...(buildPhotos.get(id) ?? []), p]);
  intakePhotos.forEach((p, i) => push(p.ticket_id, { url: p.file_url, title: `Foto komponen saat masuk ${i + 1}` }));
  finished.forEach((p) => p.first_build_url && push(p.ticket_id, { url: p.first_build_url, title: "Foto rakitan selesai" }));

  const base = (t: (typeof service)[number]["ticket"]) => ({
    ticketId: t.id,
    code: t.ticket_code,
    ticketType: t.ticket_type,
    status: t.status,
    store: t.store_location?.name ?? null,
    technician: t.technician?.name ?? null,
  });

  const rows: OutgoingRow[] = [
    ...service.map((p) => ({
      ...base(p.ticket),
      key: `s_${p.id}`,
      kind: "service" as const,
      at: p.created_at,
      category: servicePartLabel(p.part),
      name: p.item_name?.trim() || servicePartLabel(p.part),
      sku: p.sku || null,
      quantity: p.quantity,
      photos: p.photos.map((ph, i) => ({ url: ph.file_url, title: `Foto part ${i + 1}` })),
    })),
    ...upgradeRows.map((u) => ({
      ...base(u.ticket),
      key: `u_${u.id}`,
      kind: "upgrade" as const,
      at: u.ticket.created_at,
      category: u.upgrade.name,
      name: u.item_name?.trim() || u.upgrade.name,
      sku: u.sku || null,
      quantity: u.quantity,
      photos: [],
    })),
    ...build.map((c) => ({
      ...base(c.ticket),
      key: `b_${c.id}`,
      kind: "pc_build" as const,
      at: c.ticket.created_at,
      category: c.quote_label || c.catalog_category || "Komponen",
      name: c.component_name,
      sku: c.sku || null,
      quantity: c.quantity,
      photos: buildPhotos.get(c.ticket.id) ?? [],
    })),
  ];
  return rows.sort((a, b) => +b.at - +a.at || a.code.localeCompare(b.code));
}

/** The numbers on the Admin Stok dashboard. */
export async function loadStockSummary(now: number, monthStart: Date, uncodedSince: Date) {
  const notClosed = { status: { notIn: ["cancelled", "rejected"] as TicketStatus[] } };
  const [builds, partsThisMonth, uncodedParts] = await Promise.all([
    loadBuilds(undefined, now),
    db.ticketReplacedPart.count({ where: { created_at: { gte: monthStart }, ticket: notClosed } }),
    db.ticketReplacedPart.count({ where: { created_at: { gte: uncodedSince }, OR: [{ sku: null }, { sku: "" }], ticket: notClosed } }),
  ]);
  return { builds, partsThisMonth, uncodedParts };
}
