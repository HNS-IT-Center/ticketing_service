import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let session: { userId: string; role: string; name: string } | null = null;
vi.mock("@/lib/session", () => ({ getSession: async () => session }));

const readFromStorage = vi.fn<(url: string) => Promise<unknown>>();
vi.mock("@/lib/r2", () => ({ readFromStorage: (url: string) => readFromStorage(url) }));

import { GET } from "./route";
import { attachmentDisposition, downloadFileName, downloadHref } from "@/lib/download-name";

const FILE_URL = "https://attachment.hnsitcenter.com/tickets/t1/rma-damage_NGW-000412_1.jpg";
const get = (qs: string) => GET(new Request(`http://localhost/api/files/download?${qs}`));

afterEach(() => {
  session = null;
  readFromStorage.mockReset();
});

describe("GET /api/files/download", () => {
  it("is staff only, before touching storage", async () => {
    expect((await get(`url=${encodeURIComponent(FILE_URL)}`)).status).toBe(401);
    session = { userId: "c", role: "Customer", name: "x" };
    expect((await get(`url=${encodeURIComponent(FILE_URL)}`)).status).toBe(403);
    expect(readFromStorage).not.toHaveBeenCalled();
  });

  it("sends the file as an attachment under the name asked for", async () => {
    session = { userId: "r", role: "RMA", name: "Desk" };
    readFromStorage.mockResolvedValue({ body: new Blob(["jpg"]).stream(), contentType: "image/jpeg", length: 3 });
    const res = await get(new URLSearchParams({ url: FILE_URL, name: "RMA-NGW-2611-0001 - Foto Unit 1" }).toString());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Content-Disposition")).toContain('attachment; filename="RMA-NGW-2611-0001 - Foto Unit 1.jpg"');
    expect(await res.text()).toBe("jpg");
  });

  it("answers 404 for a URL that is not ours or a file that is gone", async () => {
    session = { userId: "a", role: "Administrator", name: "A" };
    readFromStorage.mockResolvedValue(null);
    expect((await get("url=https%3A%2F%2Fevil.example%2Fx")).status).toBe(404);
  });
});

describe("download names", () => {
  it("keeps the stored extension and strips path characters", () => {
    expect(downloadFileName(FILE_URL, "Nota / Pembelian")).toBe("Nota Pembelian.jpg");
    expect(downloadFileName(FILE_URL)).toBe("rma-damage_NGW-000412_1.jpg");
  });

  it("carries a non-ASCII name in filename*", () => {
    expect(attachmentDisposition("Nota — 1.jpg")).toContain("filename*=UTF-8''Nota%20%E2%80%94%201.jpg");
  });

  it("links through this app", () => {
    expect(downloadHref(FILE_URL, "x")).toBe(`/api/files/download?url=${encodeURIComponent(FILE_URL)}&name=x`);
  });
});
