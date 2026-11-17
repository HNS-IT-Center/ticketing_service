import { customAlphabet } from "nanoid";
import type { Role } from "@prisma/client";
import { getSession } from "@/lib/session";
import { uploadBufferToR2 } from "@/lib/r2";
import { storageFailedMessage } from "@/lib/upload-limit";
import { MAX_QUOTE_PDF_BYTES, readQuotePdf } from "@/lib/pc-build-quote/read";
import { findQuoteSales, matchQuoteToCatalog, ticketUsingQuote } from "@/lib/pc-build-quote/resolve";
import type { UploadedQuote } from "@/lib/pc-build-quote/parse";
import { readApiQuote } from "@/lib/pc-build-quote/api-quote";
import { parseQuoteRef } from "@/lib/ecommerce/quote-contract";
import { isEcommerceConfigured } from "@/lib/ecommerce/quotes";

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 10);

/** Whoever can open a ticket. */
const STAFF: Role[] = ["Administrator", "Technician", "Sales", "RMA"];

/**
 * POST /api/pc-build-quote — multipart, one "file": the e-commerce quotation
 * PDF for a PC build. Reads it, refuses one that is not a quotation or is
 * already a live ticket, stores it, and answers with its lines matched to the
 * catalogue for the intake form's checklist.
 *
 * Nothing here creates a ticket. `createTicketAction` reads the stored PDF
 * again itself, so a checklist edited in the browser cannot change what is
 * recorded.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!STAFF.includes(session.role as Role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  let file: File | null = null;
  try {
    const form = await req.formData();
    const raw = form.get("file");
    file = raw instanceof File && raw.size > 0 ? raw : null;
  } catch {
    file = null;
  }
  if (!file) return Response.json({ error: "Pilih PDF quotation." }, { status: 400 });
  if (file.size > MAX_QUOTE_PDF_BYTES) {
    return Response.json({ error: "PDF quotation terlalu besar (maks. 5 MB)." }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const parsed = await readQuotePdf(bytes);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 422 });
  const { lines, ...head } = parsed.quote;

  const used = await ticketUsingQuote(head.code);
  if (used) {
    return Response.json(
      { error: `Quotation ${head.code} sudah dibuat tiketnya: ${used.ticket_code}. Buka tiket itu, jangan membuat tiket baru.` },
      { status: 409 },
    );
  }

  let url: string;
  try {
    url = await uploadBufferToR2(Buffer.from(bytes), `temp/${session.userId}/quote-${head.code}-${nanoid()}.pdf`, "application/pdf");
  } catch (err) {
    console.error("[PC BUILD QUOTE] upload", err);
    return Response.json({ error: storageFailedMessage("PDF quotation") }, { status: 502 });
  }

  const [{ items, catalogChecked }, sales] = await Promise.all([matchQuoteToCatalog(lines), findQuoteSales(head.salesName)]);
  const quote: UploadedQuote = { ...head, source: "pdf", url, items, catalogChecked, sales };
  return Response.json({ quote });
}

/**
 * GET /api/pc-build-quote?ref=… — the same answer from the e-commerce API: a
 * quotation code, or the customer link sales send ("…/q/<token>"). The token
 * that opens the API stays on this server; the browser only ever sees what the
 * checklist shows. Nothing is stored here either: `createTicketAction` asks
 * the API again on create.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!STAFF.includes(session.role as Role)) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!isEcommerceConfigured()) {
    return Response.json({ error: "Pencarian quotation dari ecommerce belum diaktifkan. Unggah PDF quotation-nya." }, { status: 503 });
  }

  const ref = parseQuoteRef(new URL(req.url).searchParams.get("ref") ?? "");
  if (!ref) {
    return Response.json(
      { error: "Tulis kode quotation (contoh HNSPC-20261104-0027) atau tempel tautan quotation dari sales." },
      { status: 400 },
    );
  }
  const read = await readApiQuote(ref);
  if (!read.ok) return Response.json({ error: read.error }, { status: read.status });
  return Response.json({ quote: read.quote });
}
