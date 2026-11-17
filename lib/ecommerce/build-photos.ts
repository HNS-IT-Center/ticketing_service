import "server-only";
import { db } from "@/lib/db";
import { BUILD_STAGE_LABELS, buildStageOf, finishedBuildPhotos, type BuildStage, type FinishedPhotoGroup } from "@/lib/stock";

/**
 * A PC build's photos, asked for by the e-commerce cashier page with the
 * quotation code (owner, 2026-11-17): the cashier attaches them to the sale
 * in Accurate, and is already on that quotation when scanning it.
 *
 * Photos and where the build stands, nothing else — no customer, phone or
 * price: the e-commerce side has those on its own quotation.
 */

export type BuildPhotoGroup = "components" | FinishedPhotoGroup;

export type BuildPhoto = {
  group: BuildPhotoGroup;
  title: string;
  /** What a download should be saved as, extension included. */
  fileName: string;
  url: string;
};

export type BuildPhotosBody = {
  quoteCode: string;
  ticket: {
    code: string;
    status: string;
    stage: BuildStage | null;
    stageLabel: string | null;
    store: string | null;
    technician: string | null;
    /** When the build first reached `done`, ISO; null while it is being built. */
    finishedAt: string | null;
  };
  photos: BuildPhoto[];
};

const EXT = /\.([a-z0-9]{2,5})(?:[?#].*)?$/i;

function withExtension(name: string, url: string): string {
  const ext = url.match(EXT)?.[1]?.toLowerCase();
  return ext ? `${name}.${ext}` : name;
}

/**
 * The live ticket opened from this quotation (cancelled and rejected ones do
 * not count, as at intake), or null when there is none.
 */
export async function loadBuildPhotos(quoteCode: string): Promise<BuildPhotosBody | null> {
  const detail = await db.ticketPcBuildDetail.findFirst({
    where: { quote_code: quoteCode, ticket: { status: { notIn: ["cancelled", "rejected"] } } },
    orderBy: { ticket: { created_at: "desc" } },
    select: {
      first_build_url: true,
      revision_build_url: true,
      ticket: {
        select: {
          id: true,
          ticket_code: true,
          status: true,
          store_location: { select: { name: true } },
          technician: { select: { name: true } },
          attachments: {
            orderBy: { created_at: "asc" },
            select: { file_url: true, file_type: true, kind: true },
          },
        },
      },
    },
  });
  if (!detail) return null;
  const t = detail.ticket;

  const done = await db.ticketStatusLog.findFirst({
    where: { ticket_id: t.id, new_status: "done" },
    orderBy: { created_at: "asc" },
    select: { created_at: true },
  });

  const components = t.attachments.filter((a) => a.kind === "build_photo" && a.file_type === "image");
  const photos: BuildPhoto[] = [
    ...finishedBuildPhotos(t.ticket_code, detail, t.attachments).map((p) => ({
      group: p.group,
      title: p.title,
      fileName: withExtension(p.fileName, p.url),
      url: p.url,
    })),
    ...components.map((a, i) => {
      const n = components.length > 1 ? ` ${i + 1}` : "";
      return {
        group: "components" as const,
        title: `Foto komponen saat masuk${n}`,
        fileName: withExtension(`${t.ticket_code} - komponen masuk${n}`, a.file_url),
        url: a.file_url,
      };
    }),
  ];

  const stage = buildStageOf(t.status);
  return {
    quoteCode,
    ticket: {
      code: t.ticket_code,
      status: t.status,
      stage,
      stageLabel: stage ? BUILD_STAGE_LABELS[stage] : null,
      store: t.store_location?.name ?? null,
      technician: t.technician?.name ?? null,
      finishedAt: done?.created_at.toISOString() ?? null,
    },
    photos,
  };
}
