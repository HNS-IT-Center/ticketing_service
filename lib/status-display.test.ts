import { RmaStatus, Role, TicketStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { RMA_STATUS_META } from "@/components/rma/RmaStatusCard";
import { rmaStatusDisplay, roleDisplay, ticketStatusDisplay, TONE_CLASSES } from "./status-display";

describe("ticketStatusDisplay", () => {
  it.each(Object.values(TicketStatus))("%s has a label and a known tone", (status) => {
    const { label, tone } = ticketStatusDisplay(status);
    expect(label.trim()).not.toBe("");
    expect(label).not.toContain("_");
    expect(TONE_CLASSES[tone]).toBeDefined();
  });

  // The legacy Badge's special cases, so a migrated page reads the same.
  it("says who a waiting ticket is waiting for, when told", () => {
    expect(ticketStatusDisplay("waiting").label).toBe("Waiting");
    expect(ticketStatusDisplay("waiting", { hasTechnician: true }).label).toBe("Waiting for Work");
    expect(ticketStatusDisplay("waiting", { hasTechnician: false }).label).toBe("Waiting for Technician");
  });

  it("shows a paused ticket as Paused, and only a running one", () => {
    expect(ticketStatusDisplay("on_progress", { paused: true })).toEqual({ label: "Paused", tone: "amber" });
    expect(ticketStatusDisplay("on_progress").label).toBe("On Progress");
    expect(ticketStatusDisplay("done", { paused: true }).label).toBe("Done");
  });

  it("labels every ticket status differently", () => {
    const labels = Object.values(TicketStatus).map((s) => ticketStatusDisplay(s).label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("rmaStatusDisplay", () => {
  it.each(Object.values(RmaStatus))("%s has a label and a known tone", (status) => {
    const { label, tone } = rmaStatusDisplay(status);
    expect(label.trim()).not.toBe("");
    expect(TONE_CLASSES[tone]).toBeDefined();
  });

  // Two copies until RmaStatusCard moves onto lib/status-display.ts; this keeps
  // them from drifting apart in the meantime.
  it.each(Object.values(RmaStatus))("%s matches RMA_STATUS_META", (status) => {
    expect(rmaStatusDisplay(status)).toEqual({
      label: RMA_STATUS_META[status].label,
      tone: RMA_STATUS_META[status].tone,
    });
  });
});

describe("TONE_CLASSES", () => {
  it("names the bg, fg and border token of its own tone", () => {
    for (const [tone, classes] of Object.entries(TONE_CLASSES)) {
      expect(classes.split(" ").sort()).toEqual(
        [`bg-tone-${tone}-bg`, `border-tone-${tone}-border`, `text-tone-${tone}-fg`].sort(),
      );
    }
  });
});

describe("roleDisplay", () => {
  it.each(Object.values(Role))("%s has a label and a known tone", (role) => {
    const { label, tone } = roleDisplay(role);
    expect(label.trim()).not.toBe("");
    expect(TONE_CLASSES[tone]).toBeDefined();
  });

  it("keeps the words staff already read", () => {
    expect(roleDisplay("Administrator").label).toBe("Admin");
    expect(roleDisplay("Sales").label).toBe("CS");
    expect(roleDisplay("Pending").label).toBe("Menunggu role");
  });
});
