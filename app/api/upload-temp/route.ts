import { getSession } from "@/lib/session";
import { uploadToR2, getExt, getFileType } from "@/lib/r2";
import { customAlphabet } from "nanoid";

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 10);

/**
 * POST /api/upload-temp
 * Accepts multipart/form-data with one or more "files" entries.
 * Uploads each file to R2 under a temp/ prefix so they can be referenced
 * across multi-step form navigation without passing File objects in state.
 * Returns an array of { url, fileType } objects.
 */
export async function POST(req: Request) {
  // `requireSession()` redirects, which is right for a page and wrong here: the
  // thrown NEXT_REDIRECT was caught below and returned as
  // `500 {"error":"NEXT_REDIRECT"}`, so an unauthenticated upload reported a
  // server fault and leaked an internal error name instead of saying 401.
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return Response.json({ error: "No files provided" }, { status: 400 });
    }

    const uploaded: { url: string; fileType: "image" | "video" | "pdf"; name: string }[] = [];

    for (const file of files) {
      if (!file || file.size === 0) continue;

      const ext = getExt(file.type, file.name);
      const filename = `${nanoid()}.${ext}`;
      const path = `temp/${session.userId}/${filename}`;

      const url = await uploadToR2(file, path);
      const fileType = getFileType(file.type);

      uploaded.push({ url, fileType, name: file.name });
    }

    return Response.json({ uploaded });
  } catch (err: any) {
    console.error("[upload-temp] Error:", err);
    return Response.json({ error: err.message ?? "Upload failed" }, { status: 500 });
  }
}
