import type { AttachmentKind } from "@prisma/client";

/** Photos of a claimed unit taken at intake. */
export const MAX_UNIT_PHOTOS = 5;

/** Photos of a PC build's components as brought in, required with a quotation. */
export const MAX_BUILD_PHOTOS = 10;

/** How each kind of attachment is named on screen. Exhaustive over the enum. */
export function attachmentKindLabel(kind: AttachmentKind | null): string | null {
  switch (kind) {
    case null:
      return null;
    case "invoice":
      return "Nota pembelian";
    case "unit_photo":
      return "Foto unit saat diterima";
    case "quotation":
      return "Quotation rakitan";
    case "build_photo":
      return "Foto komponen rakitan";
    default: {
      const _exhaustive: never = kind;
      return String(_exhaustive);
    }
  }
}
