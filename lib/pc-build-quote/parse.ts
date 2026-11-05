/**
 * Reads the e-commerce "Quotation Rakitan PC" PDF (hnsitcenter.id /build-pc →
 * print) into its number and its component lines, so a PC build ticket can be
 * opened from it and every line ticked against what the customer brought.
 *
 * Pure: it takes the text the PDF holds, with each piece's position, and
 * returns what it found. `read.ts` pulls that text out of a real file. Kept
 * apart so the layout rules can be tested without a PDF.
 *
 * The quotation is a table — `#`, `KOMPONEN`, `QTY` — and each component is a
 * block: the group in letter-spaced capitals ("P R O C E S S O R") in the left
 * column, then the line number beside the item's name, the name (a variant on a
 * second line, e.g. "500GB+"), "SKU 2606000158" under it, and the quantity in
 * the right column. The rules below are about columns and order, not about
 * exact coordinates, so a font or margin change in the template does not break
 * them; the header's own "7 item" is then used to prove nothing was missed.
 */

export type TextPiece = { str: string; x: number; y: number };

export type QuoteLine = {
  /** The group as the quotation names it: "PROCESSOR", "SSD / NVME", "JASA RAKIT". */
  label: string;
  name: string;
  /** The Accurate item number printed under the name; null for a service line. */
  sku: string | null;
  quantity: number;
};

export type ParsedQuote = {
  /** "HNSPC-20261104-0027". */
  code: string;
  customer: string | null;
  /** The sales who issued it, as the PDF prints "Sales: …"; null when none is printed. */
  salesName: string | null;
  /** As printed, e.g. "4 November 2026". */
  date: string | null;
  /** Rupiah after discount, when it could be read. */
  total: number | null;
  lines: QuoteLine[];
};

export type ParseQuoteResult = { ok: true; quote: ParsedQuote } | { ok: false; error: string };

/** A quotation line with what the catalogue said about its SKU. */
export type QuoteItem = QuoteLine & {
  /** The Accurate item with exactly this SKU, when the catalogue has one. */
  catalogItemId: number | null;
  catalogCategory: string | null;
};

/** What the intake form holds once a quotation has been uploaded and read. */
export type UploadedQuote = Omit<ParsedQuote, "lines"> & {
  /** Where the PDF was stored; the server reads it again from there on create. */
  url: string;
  items: QuoteItem[];
  /** False when the catalogue could not be asked; the SKUs are then unconfirmed. */
  catalogChecked: boolean;
  /** The ticketing Sales account matching `salesName`, when exactly one does. */
  sales: { id: string; name: string } | null;
};

export const MAX_QUOTE_LINES = 30;
const CODE_PATTERN = /\b([A-Z]{2,8}-\d{8}-\d{3,6})\b/;

const NOT_A_QUOTATION =
  "PDF ini bukan quotation rakitan PC dari web HNS (nomor quotation tidak ditemukan). " +
  "Unduh ulang PDF dari halaman quotation, jangan hasil scan atau foto.";

/**
 * "P R O C E S S O R" → "PROCESSOR", "QT Y" → "QTY", "T O TA L" → "TOTAL".
 * The template spaces its small capitals letter by letter; a run of one- and
 * two-letter pieces is that, a real phrase ("JASA RAKIT PC") is left alone.
 */
export function collapseSpaced(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  const parts = t.split(" ");
  if (parts.length >= 2 && parts.every((p) => p.length <= 2)) return parts.join("");
  return t;
}

/** Word breaks are lost when a label is collapsed; put the common ones back. */
const LABEL_WORDS: Record<string, string> = {
  "SSD/NVME": "SSD / NVME",
  JASARAKIT: "JASA RAKIT",
  POWERSUPPLY: "POWER SUPPLY",
  GRAPHICSCARD: "GRAPHICS CARD",
  VGACARD: "VGA CARD",
  KOMPONENLAIN: "KOMPONEN LAIN",
  CPUCOOLER: "CPU COOLER",
  FANCASING: "FAN CASING",
  HARDDISK: "HARD DISK",
  WIFIADAPTER: "WIFI ADAPTER",
  OPERATINGSYSTEM: "OPERATING SYSTEM",
};

export function labelText(s: string): string {
  const c = collapseSpaced(s).toUpperCase();
  return LABEL_WORDS[c] ?? c;
}

const isNumber = (s: string) => /^\d+$/.test(s.trim());

/** "Rp 8.635.000" → 8635000. */
export function rupiahValue(s: string): number | null {
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

const SAME_ROW = 2.5;

/** The piece printed to the right of `anchor` on the same line. */
function rightOf(pieces: TextPiece[], anchor: TextPiece): TextPiece | null {
  return (
    pieces
      .filter((p) => p !== anchor && Math.abs(p.y - anchor.y) <= SAME_ROW && p.x > anchor.x && p.str.trim())
      .sort((a, b) => a.x - b.x)[0] ?? null
  );
}

function findCode(pages: TextPiece[][]): string | null {
  const all = pages.flat();
  const no = all.find((p) => p.str.trim() === "No.");
  if (no) {
    const next = rightOf(all, no);
    const m = next?.str.match(CODE_PATTERN);
    if (m) return m[1];
  }
  for (const p of all) {
    const m = p.str.match(CODE_PATTERN);
    if (m) return m[1];
  }
  return null;
}

function valueAfter(pages: TextPiece[][], label: string): string | null {
  const all = pages.flat();
  const anchor = all.find((p) => p.str.trim() === label);
  const v = anchor ? rightOf(all, anchor)?.str.trim() : null;
  return v || null;
}

/** "7 item · 7 unit": how many lines the quotation says it has. */
function statedLineCount(pages: TextPiece[][]): number | null {
  const all = pages.flat();
  const item = all.find((p) => /^item\b/i.test(p.str.trim()));
  if (!item) return null;
  const before = all
    .filter((p) => Math.abs(p.y - item.y) <= SAME_ROW && p.x < item.x && isNumber(p.str))
    .sort((a, b) => b.x - a.x)[0];
  return before ? Number(before.str) : null;
}

function findTotal(pages: TextPiece[][]): number | null {
  const all = pages.flat();
  // The grand total, not "Total sebelum diskon".
  const label = all.find((p) => collapseSpaced(p.str).toUpperCase() === "TOTAL");
  if (!label) return null;
  const v = rightOf(all, label);
  return v ? rupiahValue(v.str) : null;
}

type Columns = { headerY: number; leftLimit: number; qtyLimit: number };

/** Where the table's columns are on this page, from its header row. */
function columnsOf(page: TextPiece[]): Columns | null {
  const comp = page.find((p) => collapseSpaced(p.str).toUpperCase() === "KOMPONEN");
  if (!comp) return null;
  const row = page.filter((p) => Math.abs(p.y - comp.y) <= SAME_ROW);
  const hash = row.find((p) => p.str.trim() === "#");
  const qty = row.find((p) => collapseSpaced(p.str).toUpperCase() === "QTY");
  if (!hash || !qty) return null;
  return {
    headerY: comp.y,
    leftLimit: (hash.x + comp.x) / 2,
    // The quantity is right-aligned under its header; names start well left of it.
    qtyLimit: qty.x - 20,
  };
}

type Block = { label: string; nameRows: { y: number; text: string }[]; sku: string | null; quantity: number | null };

export function parseQuote(pages: TextPiece[][]): ParseQuoteResult {
  const code = findCode(pages);
  if (!code) return { ok: false, error: NOT_A_QUOTATION };

  const blocks: Block[] = [];
  let tableSeen = false;

  for (const page of pages) {
    const cols = columnsOf(page);
    if (!cols) continue;
    tableSeen = true;
    // The table ends where the totals begin.
    const end = page
      .filter((p) => p.y < cols.headerY && /^total/i.test(collapseSpaced(p.str)))
      .reduce((top, p) => Math.max(top, p.y), -Infinity);

    const body = page
      .filter((p) => p.str.trim() && p.y < cols.headerY - SAME_ROW && p.y > end + SAME_ROW)
      .sort((a, b) => b.y - a.y || a.x - b.x);

    const skuValues = new Set<TextPiece>();
    for (const p of body) {
      const s = p.str.trim();
      if (p.x < cols.leftLimit) {
        // Left column: a group name opens a block; the line number is ignored.
        if (!isNumber(s)) blocks.push({ label: labelText(s), nameRows: [], sku: null, quantity: null });
        continue;
      }
      const block = blocks.at(-1);
      if (!block) continue;
      if (p.x >= cols.qtyLimit) {
        if (isNumber(s) && block.quantity === null) block.quantity = Number(s);
        continue;
      }
      if (skuValues.has(p)) continue;
      if (s === "SKU") {
        const value = rightOf(body, p);
        if (value) {
          skuValues.add(value);
          block.sku = value.str.trim();
        }
        continue;
      }
      // Two pieces on one row are one line of the name.
      const row = block.nameRows.find((r) => Math.abs(r.y - p.y) <= SAME_ROW);
      if (row) row.text = `${row.text} ${s}`;
      else block.nameRows.push({ y: p.y, text: s });
    }
  }

  if (!tableSeen) return { ok: false, error: "Tabel komponen di PDF quotation tidak ditemukan." };

  const lines: QuoteLine[] = [];
  for (const [i, b] of blocks.entries()) {
    const [first, ...rest] = b.nameRows.map((r) => r.text.trim()).filter(Boolean);
    if (!first) return { ok: false, error: `Nama komponen ke-${i + 1} (${b.label}) tidak terbaca di PDF.` };
    if (b.quantity === null || b.quantity < 1) {
      return { ok: false, error: `Jumlah komponen ke-${i + 1} (${first}) tidak terbaca di PDF.` };
    }
    lines.push({
      label: b.label,
      // A second line is the variant the customer chose ("500GB+", "WHITE").
      name: rest.length ? `${first} — ${rest.join(" ")}` : first,
      sku: b.sku,
      quantity: b.quantity,
    });
  }

  if (lines.length === 0) return { ok: false, error: "Tidak ada komponen yang terbaca di PDF quotation." };
  if (lines.length > MAX_QUOTE_LINES) return { ok: false, error: `Quotation berisi lebih dari ${MAX_QUOTE_LINES} komponen.` };
  const stated = statedLineCount(pages);
  if (stated !== null && stated !== lines.length) {
    return {
      ok: false,
      error: `PDF menyebut ${stated} komponen tetapi yang terbaca ${lines.length}. Unduh ulang PDF dari web lalu coba lagi.`,
    };
  }

  return {
    ok: true,
    quote: {
      code,
      customer: valueAfter(pages, "Pelanggan"),
      salesName: valueAfter(pages, "Sales"),
      date: valueAfter(pages, "Tanggal"),
      total: findTotal(pages),
      lines,
    },
  };
}
