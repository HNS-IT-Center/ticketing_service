/**
 * Ticket notes as plain text, to start a text box from them.
 *
 * `Ticket.notes` holds either what was typed at intake (plain) or the editor's
 * HTML after someone edited it. Paragraphs and line breaks become new lines,
 * other tags are dropped, the common entities are decoded. Not a sanitiser —
 * the result only ever goes into a <textarea>, never into the page as HTML.
 */
export function notesToPlainText(notes: string | null | undefined): string {
  if (!notes) return "";
  return notes
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
