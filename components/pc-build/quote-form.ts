import type { UploadedQuote } from "@/lib/pc-build-quote/parse";
import { buildIndexes } from "@/lib/ecommerce/quote-contract";

/** The goods that stay in the build: the ones to tick and to record. */
export const quoteBuildIndexes = (quote: UploadedQuote) => buildIndexes(quote.items, quote.excluded ?? []);

/** Whether every line left in the build is ticked (service lines and lines taken out are not). */
export function quoteFullyChecked(quote: UploadedQuote, checked: number[]): boolean {
  return quoteBuildIndexes(quote).every((i) => checked.includes(i));
}

/**
 * The quotation's part of the create form: the PDF's stored URL, or the code
 * and the revision that was ticked for an API quotation, plus the lines taken
 * out of the build. The server reads the quotation again from either, so
 * nothing else of it is sent.
 */
export function appendQuoteFields(fd: FormData, quote: UploadedQuote, checked: number[]) {
  const inBuild = quoteBuildIndexes(quote);
  if (quote.source === "api") {
    fd.append("quote_ref", quote.code);
    fd.append("quote_revision", String(quote.revision ?? ""));
  } else {
    fd.append("quote_url", quote.url);
  }
  fd.append("quote_excluded", (quote.excluded ?? []).join(","));
  fd.append("quote_checked_count", String(checked.filter((i) => inBuild.includes(i)).length));
}
