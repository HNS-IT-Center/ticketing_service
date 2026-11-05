import "server-only";
import { getDocumentProxy } from "unpdf";
import { readFromStorage } from "@/lib/r2";
import { storageFailedMessage } from "@/lib/upload-limit";
import { parseQuote, type ParseQuoteResult, type TextPiece } from "./parse";

/** The quotation PDF is ~2 MB; anything far larger is not one. */
export const MAX_QUOTE_PDF_BYTES = 5 * 1024 * 1024;
const MAX_QUOTE_PAGES = 10;

/**
 * The text of a quotation PDF with each piece's position, read with unpdf
 * (Mozilla's pdf.js, packaged for a server), then parsed by `parse.ts`.
 *
 * Reads only the text layer: a photo or scan of a quotation has none and is
 * refused with a sentence saying to download the PDF again.
 */
export async function readQuotePdf(bytes: Uint8Array): Promise<ParseQuoteResult> {
  if (bytes.length > MAX_QUOTE_PDF_BYTES) {
    return { ok: false, error: "PDF quotation terlalu besar (maks. 5 MB)." };
  }
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
    return { ok: false, error: "Berkas ini bukan PDF. Unggah PDF quotation yang diunduh dari web." };
  }

  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    // pdf.js may take ownership of the buffer it is given; hand it a copy.
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch (err) {
    console.error("[PC BUILD QUOTE] PDF tidak bisa dibuka", err);
    return { ok: false, error: "PDF tidak bisa dibuka — rusak atau dikunci kata sandi." };
  }

  try {
    if (pdf.numPages > MAX_QUOTE_PAGES) {
      return { ok: false, error: `PDF berisi ${pdf.numPages} halaman; quotation rakitan paling banyak beberapa halaman.` };
    }
    const pages: TextPiece[][] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      pages.push(
        content.items.flatMap((item) =>
          "str" in item && item.str.trim() ? [{ str: item.str, x: item.transform[4], y: item.transform[5] }] : [],
        ),
      );
    }
    if (pages.every((p) => p.length === 0)) {
      return {
        ok: false,
        error: "PDF ini tidak berisi teks (hasil scan atau foto). Unduh ulang PDF quotation dari web.",
      };
    }
    return parseQuote(pages);
  } finally {
    await pdf.cleanup().catch(() => {});
  }
}

/**
 * The quotation stored by `/api/pc-build-quote`, read again on create. Only a
 * URL in this app's own storage resolves (`readFromStorage`), so a form cannot
 * point the server at some other file.
 */
export async function readStoredQuote(url: string): Promise<ParseQuoteResult> {
  let stored: Awaited<ReturnType<typeof readFromStorage>>;
  try {
    stored = await readFromStorage(url);
  } catch (err) {
    console.error("[PC BUILD QUOTE] read stored", err);
    return { ok: false, error: storageFailedMessage("PDF quotation") };
  }
  if (!stored) return { ok: false, error: "PDF quotation tidak ditemukan lagi. Unggah ulang PDF-nya." };
  const bytes = new Uint8Array(await new Response(stored.body).arrayBuffer());
  return readQuotePdf(bytes);
}
