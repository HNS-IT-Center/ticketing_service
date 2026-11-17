import type { UploadedQuote } from "@/lib/pc-build-quote/parse";
import { checkableIndexes } from "@/lib/ecommerce/quote-contract";

/** Whether every component and peripheral of the quotation is ticked (service lines are not). */
export function quoteFullyChecked(quote: UploadedQuote, checked: number[]): boolean {
  return checkableIndexes(quote.items).every((i) => checked.includes(i));
}

/**
 * The quotation's part of the create form: the PDF's stored URL, or the code
 * and the revision that was ticked for an API quotation. The server reads the
 * quotation again from either, so nothing else of it is sent.
 */
export function appendQuoteFields(fd: FormData, quote: UploadedQuote, checked: number[]) {
  const checkable = checkableIndexes(quote.items);
  if (quote.source === "api") {
    fd.append("quote_ref", quote.code);
    fd.append("quote_revision", String(quote.revision ?? ""));
  } else {
    fd.append("quote_url", quote.url);
  }
  fd.append("quote_checked_count", String(checked.filter((i) => checkable.includes(i)).length));
}
