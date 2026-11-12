import { describe, it, expect, vi } from "vitest";
import { isStaleDeployError, STALE_DEPLOY_EVENT } from "./stale-deploy";
import { isHandledActionError } from "./navigation-signal";

const stale = new Error(
  'Server Action "40c9f94001b4489697c07a20aab0e8d4c850" was not found on the server. Read more: https://nextjs.org/docs/messages/failed-to-find-server-action',
);

describe("stale deploy", () => {
  it("recognises the error Next throws for an action id the server does not know", () => {
    expect(isStaleDeployError(stale)).toBe(true);
    expect(isStaleDeployError(new Error("Failed to find Server Action \"abc\"."))).toBe(true);
    expect(isStaleDeployError(new Error("Body exceeded 10mb limit"))).toBe(false);
    expect(isStaleDeployError(null)).toBe(false);
  });

  it("tells the catch to stay quiet and opens the reload notice instead", () => {
    const dispatch = vi.fn();
    vi.stubGlobal("window", { dispatchEvent: dispatch });
    vi.stubGlobal("CustomEvent", class { constructor(public type: string, public init: unknown) {} });
    expect(isHandledActionError(stale)).toBe(true);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0][0].type).toBe(STALE_DEPLOY_EVENT);
    expect(isHandledActionError(new Error("anything else"))).toBe(false);
    expect(dispatch).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
