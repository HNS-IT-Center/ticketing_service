import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { compressFile, compressVideo } from "./compress";
import {
  uploadBudgetError,
  uploadFailureMessage,
  UPLOAD_BUDGET_BYTES,
  UPLOAD_BUDGET_MB,
} from "./upload-limit";

const MB = 1024 * 1024;
const file = (name: string, sizeMB: number, type = "video/mp4") =>
  new File([new Uint8Array(Math.round(sizeMB * MB))], name, { type });

describe("video upload — no transcode", () => {
  // Transcoding crashed Chrome on Android (the only browser that ran it) and
  // lost the technician's form. A video must reach the server as recorded.
  it("returns the very same file for a video", async () => {
    const v = file("kerusakan.mp4", 9);
    expect(await compressVideo(v)).toBe(v);
    expect(await compressFile(v)).toBe(v);
  });

  it("leaves no MediaRecorder / captureStream code behind", () => {
    const src = readFileSync("lib/compress.ts", "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"))
      .join("\n");
    expect(src).not.toMatch(/MediaRecorder|captureStream/);
  });
});

describe("uploadBudgetError", () => {
  it("stays under the 10 MB the proxy actually buffers", () => {
    // Measured: 9 MB accepted, 12 MB cut off. The budget leaves room for the
    // multipart framing and the text fields beside the files.
    expect(UPLOAD_BUDGET_BYTES).toBeLessThan(10 * MB);
  });

  it("accepts files that fit together", () => {
    expect(uploadBudgetError([file("a.jpg", 0.3, "image/jpeg"), file("b.mp4", 8)])).toBeNull();
  });

  it("names the one file that is too big on its own, with its size", () => {
    const err = uploadBudgetError([file("video_hp.mp4", 38.4)]);
    expect(err).toContain("video_hp.mp4");
    expect(err).toContain("38.4 MB");
    expect(err).toContain(`${UPLOAD_BUDGET_MB} MB`);
  });

  it("refuses a set that only overflows together", () => {
    const err = uploadBudgetError([file("a.mp4", 5), file("b.mp4", 5)]);
    expect(err).toMatch(/Total berkas 10\.0 MB/);
  });
});

describe("uploadFailureMessage", () => {
  it("explains a size refusal and promises the form is intact", () => {
    const msg = uploadFailureMessage(new Error("Body exceeded 10mb limit"));
    expect(msg).toMatch(/terlalu besar/);
    expect(msg).toMatch(/tidak hilang/);
  });

  it("treats anything else as a dropped connection", () => {
    expect(uploadFailureMessage(new TypeError("Failed to fetch"))).toMatch(/koneksi/);
  });
});
