/**
 * The file name a download is saved under: the caller's name if it gave a
 * usable one, else the last segment of the stored key. Path separators and
 * control characters are removed, and the stored file's extension is kept so
 * the phone or PC knows how to open it.
 */
export function downloadFileName(storedUrl: string, wanted?: string | null): string {
  const fromUrl = decodeURIComponent(storedUrl.split(/[?#]/)[0].split("/").pop() || "lampiran");
  const ext = fromUrl.includes(".") ? fromUrl.slice(fromUrl.lastIndexOf(".")) : "";
  const clean = (s: string) =>
    s
      .replace(/[\u0000-\u001f\u007f/\:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  let name = clean(wanted ?? "");
  if (!name) return clean(fromUrl) || "lampiran";
  if (ext && !name.toLowerCase().endsWith(ext.toLowerCase())) name += ext;
  return name;
}

/** Content-Disposition with an ASCII fallback and the UTF-8 name (RFC 6266 / 5987). */
export function attachmentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** The app's own download link for a stored file. */
export function downloadHref(url: string, name?: string | null): string {
  const qs = new URLSearchParams({ url });
  if (name) qs.set("name", name);
  return `/api/files/download?${qs.toString()}`;
}
