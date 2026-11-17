/**
 * The e-commerce quotation API (hnsitcenter.id, repo ecommerce-hns), as pure
 * rules: what a quotation looks like on the wire, how a staff member's input
 * names one, and which of its lines is a component, a peripheral or a service.
 *
 * GET /api/integrations/ticketing/pc-build-quotes/{code}
 * GET /api/integrations/ticketing/pc-build-quotes/by-token/{token}
 *
 * No network and no server imports: `quotes.ts` does the call, this file only
 * reads what came back, so the contract can be tested with fixtures. A body
 * that does not match is refused whole rather than half-read — a quotation
 * with a missing quantity is not one to tick components against.
 */

export type EcommerceQuoteStatus = "terbit" | "closing";

/** What a line is in the build. Sent by the e-commerce side when it has it. */
export type QuoteLineKind = "component" | "peripheral" | "service";

export type EcommerceQuoteItem = {
  productId: number;
  name: string;
  variationLabel: string | null;
  /** As printed on the quotation when it was issued. */
  sku: string | null;
  /** The product's Accurate code now; null when the product was removed or never linked. */
  accurateCode: string | null;
  quantity: number;
  unitPrice: number;
  stepName: string | null;
  stepKind: QuoteLineKind | null;
};

export type EcommerceQuote = {
  code: string;
  kind: "build" | "prebuild";
  prebuildName: string | null;
  revision: number;
  status: EcommerceQuoteStatus;
  dpAt: string | null;
  closedAt: string | null;
  customer: { name: string | null; phone: string | null };
  salesName: string | null;
  /** The quotation's owner, when the e-commerce side sends it; may be CS rather than Sales. */
  sales: { email: string | null; ssoSub: string | null } | null;
  items: EcommerceQuoteItem[];
  subtotal: number;
  /** 0 on every quotation since the assembly fee became a builder step ("Jasa Rakit" line). */
  assemblyFee: number;
  discount: number;
  total: number;
  publicUrl: string | null;
  createdAt: string;
  pricedAt: string;
  updatedAt: string;
};

// A ticket is opened from a quotation whatever its status (owner, 2026-11-16):
// the cashier marks "closing" when the finished build is scanned at the till,
// which is after the assembly, so waiting for it would hold the work up. The
// revision check at creation is what keeps the ticket on the quotation sold.

// ---------------------------------------------------------------------------
// What the person typed

export type QuoteRef = { by: "code"; code: string } | { by: "token"; token: string };

const TOKEN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * A quotation code as the e-commerce server validates it (its docs/17 § 20):
 * "HNSPC-YYYYMMDD-NNNN" for staff quotations, the number running past four
 * digits when it must, and "HNSPC-YYMMDD-XXXX" for a visitor's. Never the
 * "Rev. N" that may be printed beside it.
 */
const QUOTE_CODE = /(?<![A-Z0-9])HNSPC-(?:\d{8}-\d{4,}|\d{6}-[A-Z0-9]{4})(?![A-Z0-9])/;

/** The quotation code anywhere in `text` (a PDF's, or a pasted link), upper-cased. */
export function findQuoteCode(text: string): string | null {
  return text.toUpperCase().match(QUOTE_CODE)?.[0] ?? null;
}

/**
 * What the person typed: the customer link sales send by WhatsApp
 * (".../q/<token>"), or anything holding a quotation code — the code itself,
 * the ".../verify/<code>" link on the PDF, on any host. The code is found in
 * the text rather than the link taken apart, as the e-commerce side advises.
 */
export function parseQuoteRef(input: string): QuoteRef | null {
  const raw = input.trim();
  if (!raw) return null;
  const link = raw.match(/\/q\/([^/?#\s]+)/);
  if (link) return TOKEN.test(link[1]) ? { by: "token", token: link[1] } : null;
  const code = findQuoteCode(raw);
  return code ? { by: "code", code } : null;
}

export function quoteRefPath(ref: QuoteRef): string {
  return ref.by === "code"
    ? `/api/integrations/ticketing/pc-build-quotes/${encodeURIComponent(ref.code)}`
    : `/api/integrations/ticketing/pc-build-quotes/by-token/${encodeURIComponent(ref.token)}`;
}

// ---------------------------------------------------------------------------
// Reading the body

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) ? v : null);
const nullable = <T>(v: unknown, read: (v: unknown) => T | null): T | null | undefined =>
  v === null || v === undefined ? null : (read(v) ?? undefined);

function readItem(v: unknown): EcommerceQuoteItem | null {
  if (!isObj(v)) return null;
  const productId = int(v.productId);
  const name = str(v.name);
  const quantity = int(v.quantity);
  const unitPrice = int(v.unitPrice);
  const variationLabel = nullable(v.variationLabel, str);
  const sku = nullable(v.sku, str);
  const accurateCode = nullable(v.accurateCode, str);
  const stepName = nullable(v.stepName, str);
  const stepKind = v.stepKind === "component" || v.stepKind === "peripheral" || v.stepKind === "service" ? v.stepKind : null;
  if (productId === null || !name || quantity === null || quantity < 1 || unitPrice === null || unitPrice < 0) return null;
  if (variationLabel === undefined || sku === undefined || accurateCode === undefined || stepName === undefined) return null;
  return { productId, name, variationLabel, sku, accurateCode, quantity, unitPrice, stepName, stepKind };
}

/** The 200 body, or null when it is not the agreed shape. */
export function readEcommerceQuote(body: unknown): EcommerceQuote | null {
  if (!isObj(body)) return null;
  const code = str(body.code);
  const kind = body.kind === "build" || body.kind === "prebuild" ? body.kind : null;
  const status = body.status === "terbit" || body.status === "closing" ? body.status : null;
  const revision = int(body.revision);
  const createdAt = str(body.createdAt);
  const pricedAt = str(body.pricedAt);
  const updatedAt = str(body.updatedAt);
  const money = [body.subtotal, body.assemblyFee, body.discount, body.total].map(int);
  if (!code || !kind || !status || revision === null || !createdAt || !pricedAt || !updatedAt) return null;
  if (money.some((m) => m === null)) return null;
  if (!Array.isArray(body.items) || !isObj(body.customer)) return null;

  const items = body.items.map(readItem);
  if (items.some((i) => i === null)) return null;

  const customerName = nullable(body.customer.name, str);
  const customerPhone = nullable(body.customer.phone, str);
  const prebuildName = nullable(body.prebuildName, str);
  const salesName = nullable(body.salesName, str);
  const publicUrl = nullable(body.publicUrl, str);
  const dpAt = nullable(body.dpAt, str);
  const closedAt = nullable(body.closedAt, str);
  if ([customerName, customerPhone, prebuildName, salesName, publicUrl, dpAt, closedAt].some((v) => v === undefined)) return null;

  // Optional and newer than the rest of the contract: read when present,
  // never a reason to refuse the quotation.
  const sales = isObj(body.sales)
    ? { email: str(body.sales.email), ssoSub: str(body.sales.ssoSub) }
    : null;

  const [subtotal, assemblyFee, discount, total] = money as number[];
  return {
    code,
    kind,
    prebuildName: prebuildName ?? null,
    revision,
    status,
    dpAt: dpAt ?? null,
    closedAt: closedAt ?? null,
    customer: { name: customerName ?? null, phone: customerPhone ?? null },
    salesName: salesName ?? null,
    sales: sales && (sales.email || sales.ssoSub) ? sales : null,
    items: items as EcommerceQuoteItem[],
    subtotal,
    assemblyFee,
    discount,
    total,
    publicUrl: publicUrl && /^https:\/\//.test(publicUrl) ? publicUrl : null,
    createdAt,
    pricedAt,
    updatedAt,
  };
}

// ---------------------------------------------------------------------------
// What each line is

const fold = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Steps of the e-commerce builder that are handed over beside the PC, not built into it. */
const PERIPHERAL_STEPS = new Set(["monitor", "ups", "gaminggear", "headsetaudio", "networkcables"]);

/**
 * A component (built into the PC, ticked at intake), a peripheral (handed over
 * beside it, ticked too) or a service (labour: not ticked, billed as the
 * technician's job). The e-commerce side's own `stepKind` wins; without it the
 * step's name decides, and anything unrecognised is a component — the safe
 * side, since a component is checked by hand.
 *
 * Also used for a PDF's lines, whose group is the step name in capitals.
 */
export function quoteLineKind(stepKind: QuoteLineKind | null | undefined, stepName: string | null | undefined, name?: string | null): QuoteLineKind {
  if (stepKind) return stepKind;
  const step = fold(stepName);
  if (step.includes("jasa") || (!step && fold(name).startsWith("jasa"))) return "service";
  if (PERIPHERAL_STEPS.has(step)) return "peripheral";
  return "component";
}

/** Whether a line is ticked against what was brought in. */
export const isCheckedLine = (kind: QuoteLineKind) => kind !== "service";

export type QuoteSourceLine = {
  label: string;
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: number | null;
  kind: QuoteLineKind;
};

/**
 * The quotation's lines as the intake checklist and the ticket record them.
 * The Accurate code now, else the SKU printed when it was issued; a variant
 * stays in the name ("WD Blue SN580 — 1TB · Hitam"), because a different
 * variant is a different thing in the box. An older quotation without an
 * assembly line but with an assembly fee gets one, so the technician's job is
 * on the record either way.
 */
export function quoteSourceLines(q: EcommerceQuote): QuoteSourceLine[] {
  const lines: QuoteSourceLine[] = q.items.map((i) => ({
    label: i.stepName ?? "",
    name: i.variationLabel ? `${i.name} — ${i.variationLabel}` : i.name,
    sku: i.accurateCode ?? i.sku,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    kind: quoteLineKind(i.stepKind, i.stepName, i.name),
  }));
  if (q.assemblyFee > 0 && !lines.some((l) => l.kind === "service")) {
    lines.push({ label: "Jasa Rakit", name: "JASA RAKIT PC", sku: null, quantity: 1, unitPrice: q.assemblyFee, kind: "service" });
  }
  return lines;
}

/**
 * A checklist line's kind. Lines held in a draft saved before kinds existed
 * have none, and are read from their label as a PDF's are.
 */
export function itemKind(item: { kind?: QuoteLineKind | null; label: string; name: string }): QuoteLineKind {
  return item.kind ?? quoteLineKind(null, item.label, item.name);
}

/** Indexes of the lines to tick: every component and peripheral, no service. */
export function checkableIndexes(items: { kind?: QuoteLineKind | null; label: string; name: string }[]): number[] {
  return items.flatMap((item, i) => (isCheckedLine(itemKind(item)) ? [i] : []));
}
