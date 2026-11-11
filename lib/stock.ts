/**
 * Admin Stok's pages (owner, 2026-11-10): a read-only view, every store, of
 * the PC builds and of every part that goes out on a ticket. Nothing on them
 * changes a ticket: the work stays with the technicians and the RMA desk.
 *
 * Pure: labels and grouping; the queries are in stock-server.ts.
 */
import type { TicketStatus } from "@prisma/client";

export const OUTGOING_KINDS = ["service", "upgrade", "pc_build"] as const;
export type OutgoingKind = (typeof OUTGOING_KINDS)[number];

export const OUTGOING_KIND_LABELS: Record<OutgoingKind, string> = {
  service: "Part ganti (service)",
  upgrade: "Barang upgrade",
  pc_build: "Komponen rakitan",
};

export function isOutgoingKind(v: string | undefined): v is OutgoingKind {
  return (OUTGOING_KINDS as readonly string[]).includes(v ?? "");
}

/** Where a PC build is, in the shop's words. */
export const BUILD_STAGES = ["building", "finished", "handed_over"] as const;
export type BuildStage = (typeof BUILD_STAGES)[number];

export const BUILD_STAGE_LABELS: Record<BuildStage, string> = {
  building: "Sedang dirakit",
  finished: "Selesai, belum diserahkan",
  handed_over: "Sudah diserahkan",
};

export function buildStageOf(status: TicketStatus): BuildStage | null {
  switch (status) {
    case "waiting":
    case "on_progress":
      return "building";
    case "done":
    case "ready_for_pickup":
    case "waiting_pickup":
    case "handed_to_courier":
      return "finished";
    case "delivered":
    case "completed":
      return "handed_over";
    case "rma_process":
    case "cancelled":
    case "rejected":
      return null;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export const BUILD_FILTERS = [...BUILD_STAGES, "all"] as const;
export type BuildFilter = (typeof BUILD_FILTERS)[number];

export function isBuildFilter(v: string | undefined): v is BuildFilter {
  return (BUILD_FILTERS as readonly string[]).includes(v ?? "");
}
