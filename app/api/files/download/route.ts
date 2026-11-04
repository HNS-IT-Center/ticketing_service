import { getSession } from "@/lib/session";
import { readFromStorage } from "@/lib/r2";
import { attachmentDisposition, downloadFileName } from "@/lib/download-name";

const STAFF = new Set(["Administrator", "Technician", "Sales", "RMA"]);

/**
 * GET /api/files/download?url=<stored url>&name=<optional file name>
 *
 * Serves an attachment from this app's own origin with
 * `Content-Disposition: attachment`, so clicking "Unduh" saves the file. A
 * plain `<a download>` to the R2 domain is ignored by browsers — the file is
 * on another host — and opens in the tab instead.
 *
 * Staff only. Only files this application stored are served: the key is read
 * from the URL by `storageKeyFromUrl`, so this cannot fetch any other address.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!STAFF.has(session.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const url = params.get("url") ?? "";
  let file: Awaited<ReturnType<typeof readFromStorage>>;
  try {
    file = await readFromStorage(url);
  } catch (err) {
    console.error("[download] storage read failed:", err);
    return Response.json({ error: "Penyimpanan file sedang tidak bisa dihubungi. Coba lagi." }, { status: 502 });
  }
  if (!file) return Response.json({ error: "File tidak ditemukan." }, { status: 404 });

  const headers = new Headers({
    "Content-Type": file.contentType,
    "Content-Disposition": attachmentDisposition(downloadFileName(url, params.get("name"))),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (file.length !== null) headers.set("Content-Length", String(file.length));
  return new Response(file.body, { headers });
}
