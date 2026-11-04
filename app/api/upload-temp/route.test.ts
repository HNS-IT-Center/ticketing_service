import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let session: { userId: string; role: string; name: string } | null = { userId: "u1", role: "Technician", name: "x" };
vi.mock("@/lib/session", () => ({ getSession: async () => session }));

const uploadToR2 = vi.fn(async (_file: File, path: string) => `https://files.test/${path}`);
vi.mock("@/lib/r2", () => ({
  uploadToR2: (file: File, path: string) => uploadToR2(file, path),
  getExt: () => "jpg",
  getFileType: () => "image",
}));

import { POST } from "./route";
import { storageFailedMessage } from "@/lib/upload-limit";

afterEach(() => {
  session = { userId: "u1", role: "Technician", name: "x" };
  uploadToR2.mockClear();
});

function post() {
  const fd = new FormData();
  fd.append("files", new File(["x"], "foto.jpg", { type: "image/jpeg" }));
  return POST(new Request("http://localhost/api/upload-temp", { method: "POST", body: fd }));
}

describe("POST /api/upload-temp", () => {
  it("stores the file under the uploader's temp folder", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { uploaded: { url: string }[] };
    expect(body.uploaded[0].url).toMatch(/^https:\/\/files\.test\/temp\/u1\/\w+\.jpg$/);
  });

  it("answers a storage failure with a sentence, never the server's own error text", async () => {
    // What production said on 2026-11-04, with R2_ENDPOINT left at the local MinIO address.
    uploadToR2.mockRejectedValueOnce(
      new Error('R2_ENDPOINT must use https in production (got "http://127.0.0.1:9000").'),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post();
    spy.mockRestore();
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe(storageFailedMessage("lampiran"));
    expect(body.error).not.toContain("R2_ENDPOINT");
  });

  it("is 401 without a session", async () => {
    session = null;
    expect((await post()).status).toBe(401);
    expect(uploadToR2).not.toHaveBeenCalled();
  });
});
