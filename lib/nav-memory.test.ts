import { describe, expect, it } from "vitest";
import { backTarget, forgetPrevious, pathOf, recordVisit, type NavStore } from "./nav-memory";

function memory(): NavStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe("Kembali goes back to the list with its filters", () => {
  it("steps back in history when the previous page is another page of the app", () => {
    const s = memory();
    recordVisit(s, "/admin/tickets?status=done&q=asus");
    recordVisit(s, "/admin/tickets/abc");
    expect(backTarget(s, "/admin/tickets/abc", "/admin/tickets", 3)).toEqual({ kind: "history" });
  });

  it("a filter change on the list is not a page of its own", () => {
    const s = memory();
    recordVisit(s, "/toko/tickets");
    recordVisit(s, "/toko/tickets?status=done");
    recordVisit(s, "/toko/tickets?status=done&tech=x");
    recordVisit(s, "/toko/tickets/t1");
    expect(backTarget(s, "/toko/tickets/t1", "/toko/tickets", 5)).toEqual({ kind: "history" });
  });

  it("opened in a new tab or from outside: the list, with the filters last used on it", () => {
    const s = memory();
    recordVisit(s, "/admin/tickets?status=waiting");
    recordVisit(s, "/admin/tickets/abc");
    // A new tab has no history to step back into.
    expect(backTarget(s, "/admin/tickets/abc", "/admin/tickets", 1)).toEqual({ kind: "href", href: "/admin/tickets?status=waiting" });
    // Arrived from a pasted link: the previous page is not ours.
    forgetPrevious(s);
    expect(backTarget(s, "/admin/tickets/abc", "/admin/tickets", 4)).toEqual({ kind: "href", href: "/admin/tickets?status=waiting" });
  });

  it("falls back to the plain list when nothing is remembered, or storage fails", () => {
    expect(backTarget(memory(), "/rma/cases/x", "/rma/dashboard", 1)).toEqual({ kind: "href", href: "/rma/dashboard" });
    const broken: NavStore = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    recordVisit(broken, "/admin/tickets");
    expect(backTarget(broken, "/admin/tickets/a", "/admin/tickets", 3)).toEqual({ kind: "href", href: "/admin/tickets" });
  });

  it("pathOf drops the query and hash", () => {
    expect(pathOf("/logs?jenis=tiket#x")).toBe("/logs");
    expect(pathOf("/admin/tickets")).toBe("/admin/tickets");
  });
});
