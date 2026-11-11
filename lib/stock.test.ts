import { describe, expect, it } from "vitest";
import { buildStageOf } from "./stock";

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
