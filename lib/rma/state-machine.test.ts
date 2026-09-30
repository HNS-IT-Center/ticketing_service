import { describe, it, expect } from "vitest";
import type { RmaStatus } from "@prisma/client";
import {
  RMA_TRANSITIONS,
  RMA_TERMINAL_STATUSES,
  canActOnRma,
  findTransition,
  getAllowedTransitions,
  isTerminalRmaStatus,
  releasesTicket,
  validateRmaTransition,
} from "./state-machine";

const ALL_STATUSES: RmaStatus[] = [
  "pending_verification",
  "on_hold",
  "verified",
  "submitted_to_vendor",
  "in_vendor_process",
  "vendor_decided",
  "unit_received",
  "closed",
  "ineligible",
  "cancelled",
];

/** The spec table, restated here independently of the implementation. */
const SPEC_TRANSITIONS: [RmaStatus, RmaStatus][] = [
  ["pending_verification", "verified"],
  ["pending_verification", "on_hold"],
  ["pending_verification", "ineligible"],
  ["pending_verification", "cancelled"],
  ["on_hold", "pending_verification"],
  ["on_hold", "in_vendor_process"],
  ["on_hold", "ineligible"],
  ["on_hold", "cancelled"],
  ["verified", "submitted_to_vendor"],
  ["verified", "ineligible"],
  ["submitted_to_vendor", "in_vendor_process"],
  ["submitted_to_vendor", "on_hold"],
  ["in_vendor_process", "vendor_decided"],
  ["in_vendor_process", "on_hold"],
  ["vendor_decided", "unit_received"],
  ["unit_received", "closed"],
];

/** Payload that satisfies whatever a given transition demands. */
function satisfyingInput(from: RmaStatus, to: RmaStatus) {
  const t = findTransition(from, to);
  const input: Record<string, string> = {};
  for (const field of t?.requires ?? []) {
    input[field] = field === "decision" ? "repaired" : "diisi";
  }
  return input;
}

describe("transition table", () => {
  it("matches the agreed spec exactly — no extra, no missing", () => {
    const actual = RMA_TRANSITIONS.map((t) => `${t.from}->${t.to}`).sort();
    const expected = SPEC_TRANSITIONS.map(([f, t]) => `${f}->${t}`).sort();
    expect(actual).toEqual(expected);
  });

  it("has no duplicate from->to pairs", () => {
    const pairs = RMA_TRANSITIONS.map((t) => `${t.from}->${t.to}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("gives every transition a label and a description", () => {
    for (const t of RMA_TRANSITIONS) {
      expect(t.label.trim()).not.toBe("");
      expect(t.description.trim()).not.toBe("");
    }
  });

  it("never allows a self-transition", () => {
    expect(RMA_TRANSITIONS.filter((t) => t.from === t.to)).toEqual([]);
  });
});

describe("terminal states", () => {
  it("treats closed, cancelled and ineligible as terminal", () => {
    expect(RMA_TERMINAL_STATUSES).toEqual(["closed", "cancelled", "ineligible"]);
    expect(isTerminalRmaStatus("closed")).toBe(true);
    expect(isTerminalRmaStatus("cancelled")).toBe(true);
    expect(isTerminalRmaStatus("ineligible")).toBe(true);
    expect(isTerminalRmaStatus("verified")).toBe(false);
  });

  it("offers no outgoing transition from a terminal state", () => {
    expect(getAllowedTransitions("closed")).toEqual([]);
    expect(getAllowedTransitions("cancelled")).toEqual([]);
    // A claim turned down is finished. Re-opening it means a new claim, not a
    // transition back out of here.
    expect(getAllowedTransitions("ineligible")).toEqual([]);
  });

  it("releases the parent ticket back to `done` from the three terminal states", () => {
    // An ineligible claim still has a unit sitting on the shelf that belongs to
    // someone, so it goes back through the ordinary handover chain exactly as a
    // closed or cancelled one does.
    for (const s of ALL_STATUSES) {
      expect(releasesTicket(s), s).toBe(
        s === "closed" || s === "cancelled" || s === "ineligible"
      );
    }
  });

  it("releases exactly the statuses it calls terminal", () => {
    for (const s of ALL_STATUSES) {
      expect(releasesTicket(s), s).toBe(isTerminalRmaStatus(s));
    }
  });
});

describe("validateRmaTransition — every legal move", () => {
  it.each(SPEC_TRANSITIONS)("allows %s -> %s for RMA when fields are filled", (from, to) => {
    const result = validateRmaTransition({
      role: "RMA",
      from,
      to,
      input: satisfyingInput(from, to),
    });
    expect(result.ok).toBe(true);
  });

  it.each(SPEC_TRANSITIONS)("allows %s -> %s for Administrator too", (from, to) => {
    const result = validateRmaTransition({
      role: "Administrator",
      from,
      to,
      input: satisfyingInput(from, to),
    });
    expect(result.ok).toBe(true);
  });
});

describe("validateRmaTransition — every illegal move", () => {
  const legal = new Set(SPEC_TRANSITIONS.map(([f, t]) => `${f}->${t}`));
  const illegal = ALL_STATUSES.flatMap((from) =>
    ALL_STATUSES.filter((to) => from !== to && !legal.has(`${from}->${to}`)).map(
      (to) => [from, to] as [RmaStatus, RmaStatus]
    )
  );

  it("covers a meaningful number of illegal pairs", () => {
    // Derived, not hardcoded: adding a status to the enum must not quietly
    // leave this assertion measuring the old matrix.
    expect(illegal.length).toBe(
      ALL_STATUSES.length * (ALL_STATUSES.length - 1) - SPEC_TRANSITIONS.length
    );
  });

  it.each(illegal)("rejects %s -> %s", (from, to) => {
    const result = validateRmaTransition({
      role: "RMA",
      from,
      to,
      // Hand it everything, so a rejection can only come from the table itself.
      input: {
        hold_reason: "x",
        vendor_name: "x",
        vendor_rma_number: "x",
        decision: "repaired",
        replacement_sn: "x",
      },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a self-transition", () => {
    for (const s of ALL_STATUSES) {
      const result = validateRmaTransition({ role: "RMA", from: s, to: s });
      expect(result.ok).toBe(false);
    }
  });
});

describe("role guard", () => {
  it("accepts only RMA and Administrator", () => {
    expect(canActOnRma("RMA")).toBe(true);
    expect(canActOnRma("Administrator")).toBe(true);
    expect(canActOnRma("Technician")).toBe(false);
    expect(canActOnRma("Sales")).toBe(false);
    expect(canActOnRma("Customer")).toBe(false);
  });

  it.each(["Technician", "Sales", "Customer", "", "rma", "ADMINISTRATOR"])(
    "refuses role %s on an otherwise valid transition",
    (role) => {
      const result = validateRmaTransition({
        role,
        from: "pending_verification",
        to: "verified",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("RMA");
      }
    }
  );

  it("checks the role before the transition table", () => {
    // Technician attempting a move that is illegal anyway — the role message wins,
    // so we never leak which transitions exist to an unauthorized caller.
    const result = validateRmaTransition({
      role: "Technician",
      from: "closed",
      to: "verified",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Administrator");
  });
});

describe("required fields", () => {
  it("requires hold_reason for every move into on_hold", () => {
    const intoHold = RMA_TRANSITIONS.filter((t) => t.to === "on_hold");
    expect(intoHold.length).toBeGreaterThan(0);
    for (const t of intoHold) {
      expect(t.requires).toContain("hold_reason");
      const result = validateRmaTransition({ role: "RMA", from: t.from, to: "on_hold" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.missing).toContain("hold_reason");
    }
  });

  it("requires hold_reason for every move into cancelled", () => {
    const intoCancel = RMA_TRANSITIONS.filter((t) => t.to === "cancelled");
    expect(intoCancel.length).toBeGreaterThan(0);
    for (const t of intoCancel) {
      const result = validateRmaTransition({ role: "RMA", from: t.from, to: "cancelled" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.missing).toContain("hold_reason");
    }
  });

  it("treats whitespace-only values as missing", () => {
    const result = validateRmaTransition({
      role: "RMA",
      from: "pending_verification",
      to: "on_hold",
      input: { hold_reason: "   " },
    });
    expect(result.ok).toBe(false);
  });

  // Changed 2026-09-30: vendor_rma_number is the SUPPLIER claim number, and
  // only a store-stock unit is claimed against the shop's supplier. It used to
  // be demanded of every claim, including a customer's own unit, which has no
  // supplier claim to reference.
  it("requires the vendor name from every claim, whatever the ownership", () => {
    for (const unitOwnership of ["store_stock", "customer"] as const) {
      const none = validateRmaTransition({
        role: "RMA",
        from: "verified",
        to: "submitted_to_vendor",
        unitOwnership,
        input: unitOwnership === "store_stock" ? { vendor_rma_number: "SUP-1" } : {},
      });
      expect(none.ok).toBe(false);
      if (!none.ok) expect(none.missing).toContain("vendor_name");
    }

    const partial = validateRmaTransition({
      role: "RMA",
      from: "verified",
      to: "submitted_to_vendor",
      unitOwnership: "store_stock",
      input: { vendor_name: "Asus Service Center" },
    });
    expect(partial.ok).toBe(false);
    if (!partial.ok) expect(partial.missing).toEqual(["vendor_rma_number"]);

    const full = validateRmaTransition({
      role: "RMA",
      from: "verified",
      to: "submitted_to_vendor",
      unitOwnership: "store_stock",
      input: { vendor_name: "Asus Service Center", vendor_rma_number: "RMA-991" },
    });
    expect(full.ok).toBe(true);
  });

  it("does not require shipping_tracking to submit to a vendor", () => {
    const t = findTransition("verified", "submitted_to_vendor");
    expect(t?.requires).not.toContain("shipping_tracking");
  });

  it("requires a decision to record a vendor outcome", () => {
    const result = validateRmaTransition({
      role: "RMA",
      from: "in_vendor_process",
      to: "vendor_decided",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(["decision"]);
  });

  it("requires replacement_sn only when the decision is `replaced`", () => {
    const withoutSn = validateRmaTransition({
      role: "RMA",
      from: "in_vendor_process",
      to: "vendor_decided",
      input: { decision: "replaced" },
    });
    expect(withoutSn.ok).toBe(false);
    if (!withoutSn.ok) expect(withoutSn.missing).toEqual(["replacement_sn"]);

    const withSn = validateRmaTransition({
      role: "RMA",
      from: "in_vendor_process",
      to: "vendor_decided",
      input: { decision: "replaced", replacement_sn: "SN-NEW-001" },
    });
    expect(withSn.ok).toBe(true);

    for (const decision of ["repaired", "refund", "rejected"] as const) {
      const result = validateRmaTransition({
        role: "RMA",
        from: "in_vendor_process",
        to: "vendor_decided",
        input: { decision },
      });
      expect(result.ok).toBe(true);
    }
  });

  it("demands nothing for the unconditional transitions", () => {
    const free: [RmaStatus, RmaStatus][] = [
      ["pending_verification", "verified"],
      ["on_hold", "pending_verification"],
      ["on_hold", "in_vendor_process"],
      ["submitted_to_vendor", "in_vendor_process"],
      ["vendor_decided", "unit_received"],
      ["unit_received", "closed"],
    ];
    for (const [from, to] of free) {
      expect(findTransition(from, to)?.requires).toEqual([]);
      expect(validateRmaTransition({ role: "RMA", from, to }).ok).toBe(true);
    }
  });
});

describe("happy path — replaced unit, end to end", () => {
  it("walks pending_verification through to closed", () => {
    const path: [RmaStatus, RmaStatus, Record<string, string>][] = [
      ["pending_verification", "verified", {}],
      ["verified", "submitted_to_vendor", { vendor_name: "Asus", vendor_rma_number: "RMA-1" }],
      ["submitted_to_vendor", "in_vendor_process", {}],
      ["in_vendor_process", "vendor_decided", { decision: "replaced", replacement_sn: "SN-2" }],
      ["vendor_decided", "unit_received", {}],
      ["unit_received", "closed", {}],
    ];
    for (const [from, to, input] of path) {
      const result = validateRmaTransition({ role: "RMA", from, to, input });
      expect(result.ok, `${from} -> ${to}`).toBe(true);
    }
    expect(releasesTicket("closed")).toBe(true);
  });

  it("walks the on_hold detour back into the vendor process", () => {
    const path: [RmaStatus, RmaStatus, Record<string, string>][] = [
      ["pending_verification", "on_hold", { hold_reason: "Nota belum ada" }],
      ["on_hold", "pending_verification", {}],
      ["pending_verification", "verified", {}],
    ];
    for (const [from, to, input] of path) {
      expect(validateRmaTransition({ role: "RMA", from, to, input }).ok, `${from} -> ${to}`).toBe(
        true
      );
    }
  });
});

describe("getAllowedTransitions drives the UI", () => {
  it("returns exactly the moves the table defines", () => {
    for (const from of ALL_STATUSES) {
      const allowed = getAllowedTransitions(from);
      const expected = SPEC_TRANSITIONS.filter(([f]) => f === from).map(([, t]) => t);
      expect(allowed.map((t) => t.to).sort()).toEqual(expected.sort());
    }
  });

  it("leaves no state stranded except the terminal ones", () => {
    for (const from of ALL_STATUSES) {
      if (isTerminalRmaStatus(from)) continue;
      expect(getAllowedTransitions(from).length).toBeGreaterThan(0);
    }
  });

  it("can reach closed from pending_verification", () => {
    // Breadth-first walk of the graph — guards against an unreachable happy path.
    const seen = new Set<RmaStatus>(["pending_verification"]);
    const queue: RmaStatus[] = ["pending_verification"];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const t of getAllowedTransitions(current)) {
        if (!seen.has(t.to)) {
          seen.add(t.to);
          queue.push(t.to);
        }
      }
    }
    for (const s of ALL_STATUSES) {
      expect(seen.has(s), `${s} unreachable`).toBe(true);
    }
  });
});

describe("store-stock transfer number", () => {
  const base = { role: "RMA" as const, from: "pending_verification" as const };

  it("refuses to verify a store-stock case without the transfer number", () => {
    const r = validateRmaTransition({ ...base, to: "verified", unitOwnership: "store_stock" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toContain("stock_transfer_number");
      expect(r.error).toContain("Nomor pemindahan stok");
    }
  });

  it("accepts the verification once the number is given", () => {
    const r = validateRmaTransition({
      ...base,
      to: "verified",
      unitOwnership: "store_stock",
      input: { stock_transfer_number: "PM-2026-0912" },
    });
    expect(r.ok).toBe(true);
  });

  it("demands nothing of a customer's own unit — it is never transferred", () => {
    const r = validateRmaTransition({ ...base, to: "verified", unitOwnership: "customer" });
    expect(r.ok).toBe(true);
  });

  it("treats a blank string as missing, not as an answer", () => {
    const r = validateRmaTransition({
      ...base,
      to: "verified",
      unitOwnership: "store_stock",
      input: { stock_transfer_number: "   " },
    });
    expect(r.ok).toBe(false);
  });

  // The requirement exists to keep a unit traceable once it leaves the shop
  // floor. Turning the claim down, holding it or cancelling it all leave the
  // unit where it is, so none of them may demand a transfer that never happened.
  it.each([
    ["ineligible", { ineligibility_reason: "Kerusakan akibat cairan" }],
    ["on_hold", { hold_reason: "Menunggu faktur" }],
    ["cancelled", { hold_reason: "Ditarik oleh toko" }],
  ] as const)("does not demand it when moving to %s", (to, input) => {
    const r = validateRmaTransition({ ...base, to, unitOwnership: "store_stock", input });
    expect(r.ok).toBe(true);
  });

  // on_hold -> in_vendor_process reaches the vendor without passing through
  // `verified`. A requirement one path can walk around is worse than none.
  it("closes the on_hold -> in_vendor_process bypass", () => {
    const r = validateRmaTransition({
      role: "RMA",
      from: "on_hold",
      to: "in_vendor_process",
      unitOwnership: "store_stock",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toContain("stock_transfer_number");
  });

  it("leaves that same bypass open for a customer's unit", () => {
    const r = validateRmaTransition({
      role: "RMA",
      from: "on_hold",
      to: "in_vendor_process",
      unitOwnership: "customer",
    });
    expect(r.ok).toBe(true);
  });

  // Existing callers that do not pass unitOwnership must keep working.
  it("applies nothing when ownership is not supplied", () => {
    const r = validateRmaTransition({ ...base, to: "verified" });
    expect(r.ok).toBe(true);
  });
});

describe("supplier claim number depends on where the unit came from", () => {
  const base = { role: "RMA" as const, from: "verified" as const, to: "submitted_to_vendor" as const };

  it("demands it for a store-stock unit — the shop claims against its supplier", () => {
    const r = validateRmaTransition({
      ...base,
      unitOwnership: "store_stock",
      input: { vendor_name: "Asus Service Center", stock_transfer_number: "PM-1" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toContain("vendor_rma_number");
      expect(r.error).toContain("Nomor klaim pemasok");
    }
  });

  it("accepts a store-stock unit once the number is given", () => {
    const r = validateRmaTransition({
      ...base,
      unitOwnership: "store_stock",
      input: { vendor_name: "Asus", vendor_rma_number: "SUP-99", stock_transfer_number: "PM-1" },
    });
    expect(r.ok).toBe(true);
  });

  // A customer's own unit is not claimed against the shop's supplier. Its
  // reference number is often not issued when the unit is sent, so nothing is
  // demanded of it.
  it("demands only the vendor name for a customer's unit", () => {
    const r = validateRmaTransition({
      ...base,
      unitOwnership: "customer",
      input: { vendor_name: "Asus" },
    });
    expect(r.ok).toBe(true);
  });

  it("still demands the vendor name from both", () => {
    for (const unitOwnership of ["store_stock", "customer"] as const) {
      const r = validateRmaTransition({ ...base, unitOwnership, input: {} });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.missing).toContain("vendor_name");
    }
  });

  it("accepts the customer's optional reference number when supplied", () => {
    const r = validateRmaTransition({
      ...base,
      unitOwnership: "customer",
      input: { vendor_name: "Asus", customer_ticket_number: "TKT-778" },
    });
    expect(r.ok).toBe(true);
  });
});
