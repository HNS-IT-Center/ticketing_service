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

/**
 * The Rakitan PC search box: ticket code, quotation code or customer name,
 * ignoring case and spacing — what a cashier holds when looking a build up.
 */
export function buildMatches(row: { code: string; quoteCode: string | null; customer: string }, query: string): boolean {
  const fold = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const q = fold(query);
  if (!q) return true;
  return [row.code, row.quoteCode ?? "", row.customer].some((v) => fold(v).includes(q));
}

/**
 * A finished build's photo, as offered for download on Rakitan PC — what the
 * cashier uploads to Accurate. `fileName` is what a download is saved as.
 */
export type FinishedPhoto = { url: string; title: string; fileName: string; group: FinishedPhotoGroup };

/** Which of the places below a photo came from — a stable key for other systems. */
export type FinishedPhotoGroup = "first_build" | "revision" | "work_proof" | "intake";

const IMAGE_FILE = /\.(jpe?g|png|gif|webp|heic|heif|avif)(\?.*)?$/i;

/** Where a photo of the finished build came from, by its stored file name. */
const FINISHED_GROUPS = [
  { prefix: "first-build_", title: "Rakitan jadi", file: "rakitan jadi", group: "first_build" },
  { prefix: "revision-", title: "Revisi rakitan", file: "rakitan revisi", group: "revision" },
  { prefix: "work-proof_", title: "Bukti selesai", file: "bukti selesai", group: "work_proof" },
] as const;
const INTAKE = { title: "Foto saat tiket dibuat", file: "foto masuk", group: "intake" } as const;

/** Files that are on the ticket but are not of the finished build. */
const NOT_THE_BUILD = ["pickup-proof", "courier-proof", "delivery-proof", "cancel-proof", "rma-"];

function storedName(url: string): string {
  return decodeURIComponent(url.split(/[?#]/)[0].split("/").pop() ?? "");
}

/**
 * Every photo of a finished build — what the cashier uploads to Accurate —
 * from the places a technician or Sales puts one, told apart by file name:
 *
 *   first-build_  the "First Build" box (each upload, not only the latest);
 *   revision-N_   Sales' revisions;
 *   work-proof_   the photos sent with "Confirm Work Done" — usually where
 *                 the finished build is, and often several;
 *   anything else without a kind: the files attached when the ticket was
 *                 made. A build without a quotation stores the first of them
 *                 as `first_build_url`, which is all this page used to offer.
 *
 * Left out: handover and RMA files, the quotation, the component photos of a
 * quotation build (`build_photo`, shown on their own), and anything that is
 * not an image — Accurate takes photos, and a video stays on the ticket page.
 * Order: finished build, revisions, done proof, intake.
 */
export function finishedBuildPhotos(
  code: string,
  detail: { first_build_url: string | null; revision_build_url: string | null } | null,
  attachments: readonly { file_url: string; file_type: string; kind: string | null }[],
): FinishedPhoto[] {
  const groups = [...FINISHED_GROUPS.map(() => [] as string[]), [] as string[]];
  const seen = new Set<string>();
  const add = (g: number, url: string) => {
    if (seen.has(url)) return;
    seen.add(url);
    groups[g].push(url);
  };
  for (const a of attachments) {
    if (a.file_type !== "image" || a.kind !== null) continue;
    const name = storedName(a.file_url);
    if (NOT_THE_BUILD.some((p) => name.startsWith(p))) continue;
    const g = FINISHED_GROUPS.findIndex((f) => name.startsWith(f.prefix));
    add(g < 0 ? FINISHED_GROUPS.length : g, a.file_url);
  }
  // Kept on the detail but missing from the attachments: older tickets.
  for (const url of [detail?.first_build_url, detail?.revision_build_url]) {
    if (!url || seen.has(url) || !IMAGE_FILE.test(url)) continue;
    const name = storedName(url);
    const g = FINISHED_GROUPS.findIndex((f) => name.startsWith(f.prefix));
    add(g < 0 ? FINISHED_GROUPS.length : g, url);
  }

  const labels = [...FINISHED_GROUPS, INTAKE];
  return groups.flatMap((urls, g) =>
    urls.map((url, i) => {
      const n = urls.length > 1 ? ` ${i + 1}` : "";
      return { url, title: `${labels[g].title}${n}`, fileName: `${code} - ${labels[g].file}${n}`, group: labels[g].group };
    }),
  );
}
