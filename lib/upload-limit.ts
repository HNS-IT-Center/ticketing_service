/**
 * How much one submission may carry, and what to say when it carries more.
 *
 * The real ceiling is NOT `serverActions.bodySizeLimit` (20 MB). `proxy.ts`
 * runs on every route, and Next 16 buffers a request body for the proxy only up
 * to `proxyClientMaxBodySize`, 10 MB by default — the rest is cut off and the
 * upload dies with "Failed to parse body as FormData". Measured 2026-10-14
 * against /api/upload-temp: 5 MB and 9 MB accepted, 12 MB refused.
 *
 * Every number in the upload UI derived from 20 (or 64) MB was therefore a
 * promise the server could not keep. The budget sits under 10 MB to leave room
 * for the multipart framing and the form's text fields.
 */
export const UPLOAD_BUDGET_BYTES = 9 * 1024 * 1024;
export const UPLOAD_BUDGET_MB = 9;

const MB = 1024 * 1024;
const mb = (bytes: number) => (bytes / MB).toFixed(1);

/** Why these files cannot go up together, or null when they can. */
export function uploadBudgetError(files: { name: string; size: number }[]): string | null {
  const tooBig = files.find((f) => f.size > UPLOAD_BUDGET_BYTES);
  if (tooBig) {
    return (
      `"${tooBig.name}" berukuran ${mb(tooBig.size)} MB, melebihi batas ${UPLOAD_BUDGET_MB} MB. ` +
      "Untuk video: rekam lebih pendek, atau turunkan resolusi kamera ke 720p."
    );
  }
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > UPLOAD_BUDGET_BYTES) {
    return `Total berkas ${mb(total)} MB, melebihi batas ${UPLOAD_BUDGET_MB} MB per pengiriman. Kurangi jumlah atau ukuran berkas.`;
  }
  return null;
}

/**
 * What to tell the person when the action itself threw — the request never
 * produced an answer, as opposed to returning `{ error }`.
 *
 * Used inside a `catch` that keeps the form open. Before this, five forms had
 * no catch at all: the rejection reached React, the app has no error boundary
 * of its own, and the page was replaced — taking every typed field with it.
 */
export function uploadFailureMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  if (/body exceeded|unexpected end of form|failed to parse body|413/i.test(text)) {
    return `Pengiriman gagal: berkas terlalu besar (maks. ${UPLOAD_BUDGET_MB} MB per pengiriman). Isian Anda tidak hilang — kurangi ukuran berkas lalu kirim lagi.`;
  }
  return "Pengiriman gagal, kemungkinan koneksi terputus. Isian Anda tidak hilang — periksa sinyal lalu kirim lagi.";
}
