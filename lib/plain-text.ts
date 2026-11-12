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

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * The other way: text typed in a box, as the HTML the ticket pages render
 * (`dangerouslySetInnerHTML`). Escaped, so nothing typed becomes markup; a
 * blank line starts a paragraph, a single line break stays one.
 * `notesToPlainText` reads it back to the same text.
 */
export function plainTextToNotesHtml(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((para) => `<p>${para.split("\n").map(escapeHtml).join("<br>")}</p>`)
    .join("");
}
