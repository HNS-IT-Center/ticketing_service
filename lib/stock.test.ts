import { describe, expect, it } from "vitest";
import { buildMatches, buildStageOf, finishedBuildPhotos } from "./stock";

describe("buildStageOf", () => {
  it("places a build by its ticket status, and leaves out those that ended without one", () => {
    expect(buildStageOf("waiting")).toBe("building");
    expect(buildStageOf("on_progress")).toBe("building");
    expect(buildStageOf("done")).toBe("finished");
    expect(buildStageOf("handed_to_courier")).toBe("finished");
    expect(buildStageOf("completed")).toBe("handed_over");
    expect(buildStageOf("cancelled")).toBeNull();
    expect(buildStageOf("rejected")).toBeNull();
  });
});

describe("buildMatches", () => {
  const row = { code: "NGH-000160", quoteCode: "QTN/2026/11/0274", customer: "Budi  Santoso" };
  it("finds a build by ticket code, quotation code or customer, ignoring case and spacing", () => {
    expect(buildMatches(row, "ngh-000160")).toBe(true);
    expect(buildMatches(row, "0274")).toBe(true);
    expect(buildMatches(row, " budi santoso ")).toBe(true);
    expect(buildMatches(row, "")).toBe(true);
    expect(buildMatches(row, "siti")).toBe(false);
    expect(buildMatches({ ...row, quoteCode: null }, "qtn")).toBe(false);
  });
});

describe("finishedBuildPhotos", () => {
  const R2 = "https://files.example/tickets/t1/";
  const img = (name: string, kind: string | null = null) => ({ file_url: R2 + name, file_type: "image", kind });

  it("collects every photo of the build — intake and done proof included — in a fixed order", () => {
    // NGW-000274 as stored: four intake photos, the first also first_build_url.
    const photos = finishedBuildPhotos(
      "NGW-000274",
      { first_build_url: R2 + "7e19.jpg", revision_build_url: null },
      [
        img("7e19.jpg"),
        img("fmwe.jpg"),
        img("work-proof_NGW-000274_a.jpg"),
        img("first-build_NGW-000274_a.webp"),
        img("pickup-proof_NGW-000274_b.jpg"), // handover, not the build
        img("comp.jpg", "build_photo"), // a quotation build's components
        { file_url: R2 + "work-proof_NGW-000274_clip.mp4", file_type: "video", kind: null },
        { file_url: R2 + "daftar.pdf", file_type: "pdf", kind: null },
      ],
    );
    expect(photos.map((p) => p.title)).toEqual(["Rakitan jadi", "Bukti selesai", "Foto saat tiket dibuat 1", "Foto saat tiket dibuat 2"]);
    expect(photos.map((p) => p.fileName)).toEqual([
      "NGW-000274 - rakitan jadi",
      "NGW-000274 - bukti selesai",
      "NGW-000274 - foto masuk 1",
      "NGW-000274 - foto masuk 2",
    ]);
  });

  it("finds the photos of a build that only has its done proof", () => {
    const photos = finishedBuildPhotos("NGH-000202", null, [img("work-proof_NGH-000202_a.jpg"), img("work-proof_NGH-000202_b.jpg")]);
    expect(photos.map((p) => p.title)).toEqual(["Bukti selesai 1", "Bukti selesai 2"]);
  });

  it("still offers a detail URL no attachment holds, by its name", () => {
    expect(finishedBuildPhotos("A", { first_build_url: R2 + "x.jpg", revision_build_url: R2 + "revision-2_A_y.jpg" }, []).map((p) => p.title)).toEqual([
      "Revisi rakitan",
      "Foto saat tiket dibuat",
    ]);
    expect(finishedBuildPhotos("X", { first_build_url: R2 + "x.pdf", revision_build_url: null }, [])).toEqual([]);
  });
});
