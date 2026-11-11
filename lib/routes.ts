/**
 * The single mapping from a role to where it belongs in the app.
 *
 * Pure module — no server imports, no database, no next/* — so proxy.ts,
 * server actions, server components and client components can all share it and
 * it stays unit testable.
 *
 * The switches are exhaustive over the Prisma `Role` enum via
 * `const _exhaustive: never`, so adding a role to the schema without giving it
 * a destination fails `tsc` instead of silently falling through to a default.
 * That default is exactly what produced the `/login` → `/login` redirect loop
 * this module replaces.
 */

import type { Role } from "@prisma/client";

/** Portal segment each role lands in; also the DashboardShell `role` prop. */
export type Portal = "admin" | "technician" | "sales" | "rma" | "toko" | "stok" | "finance" | "customer";

export type RoleDestination =
  | { allowed: true; dashboard: string; portal: Portal }
  | { allowed: false; reason: string };

/**
 * Where a role goes after authenticating.
 *
 * A denied role never points at `/login`: sending a session holder there makes
 * the proxy bounce them straight back. `/unauthorized` is a public route that
 * renders, so it terminates.
 */
export const DENIED_DESTINATION = "/unauthorized";

export function destinationForRole(role: Role): RoleDestination {
  switch (role) {
    case "Administrator":
      return { allowed: true, dashboard: "/admin/dashboard", portal: "admin" };
    case "Technician":
      return { allowed: true, dashboard: "/technician/dashboard", portal: "technician" };
    case "Sales":
      return { allowed: true, dashboard: "/sales/dashboard", portal: "sales" };
    case "RMA":
      return { allowed: true, dashboard: "/rma/dashboard", portal: "rma" };
    case "StoreSupervisor":
      // Kepala toko: their stores' progress, read only.
      return { allowed: true, dashboard: "/toko/dashboard", portal: "toko" };
    case "StockAdmin":
      // Admin stok: PC builds checked against their quotation, parts going out.
      return { allowed: true, dashboard: "/stok/dashboard", portal: "stok" };
    case "Finance":
      // Finance: store-stock claims and how long each vendor takes, read only.
      return { allowed: true, dashboard: "/finance/dashboard", portal: "finance" };
    case "Customer":
      // Customers have no login; they track a ticket through its public link.
      return {
        allowed: false,
        reason: "Customer login is disabled. Please use your ticket link.",
      };
    case "Pending":
      // Signed in through SSO, not yet given a role here. /unauthorized tells
      // them so and lets them sign out.
      return {
        allowed: false,
        reason: "Akun Anda sudah terdaftar dan sedang menunggu penetapan role oleh admin.",
      };
    default: {
      const _exhaustive: never = role;
      return { allowed: false, reason: `Unknown role: ${String(_exhaustive)}` };
    }
  }
}

const ROLE_NAMES = ["Administrator", "Technician", "Sales", "RMA", "Customer", "Pending", "StoreSupervisor", "StockAdmin", "Finance"] as const;

export function isRole(value: string): value is Role {
  return (ROLE_NAMES as readonly string[]).includes(value);
}

/** Same as destinationForRole, for a role that arrives as a plain string (a JWT claim). */
export function destinationForRoleName(role: string): RoleDestination {
  if (!isRole(role)) return { allowed: false, reason: `Unknown role: ${role}` };
  return destinationForRole(role);
}

/**
 * The path to redirect a session holder to. Never returns `/login`, so a
 * redirect issued with this can not bounce back into the proxy.
 */
export function dashboardPathForRoleName(role: string): string {
  const destination = destinationForRoleName(role);
  return destination.allowed ? destination.dashboard : DENIED_DESTINATION;
}

// ── Route prefixes each portal owns ─────────────────────────────────────────
// A role may enter a portal when it appears in that portal's allow-list.
export const PORTAL_ROUTES: { prefix: string; allowed: readonly Role[] }[] = [
  { prefix: "/admin", allowed: ["Administrator"] },
  { prefix: "/technician", allowed: ["Technician"] },
  { prefix: "/sales", allowed: ["Sales"] },
  { prefix: "/rma", allowed: ["RMA", "Administrator"] },
  { prefix: "/toko", allowed: ["StoreSupervisor", "Administrator"] },
  { prefix: "/stok", allowed: ["StockAdmin", "Administrator"] },
  { prefix: "/finance", allowed: ["Finance", "Administrator"] },
];

/** True when `role` may open `pathname`. Paths owned by no portal are open to any session. */
export function canEnter(pathname: string, role: string): boolean {
  const owner = PORTAL_ROUTES.find((r) => pathname.startsWith(r.prefix));
  if (!owner) return true;
  return isRole(role) && (owner.allowed as readonly string[]).includes(role);
}

// ── Where each portal's ticket LIST lives ───────────────────────────────────

/**
 * The ticket list a portal lands on after creating a ticket.
 *
 * `createTicketAction` used to decide this with a hand-rolled if-chain whose
 * final branch was `/ticket/${public_share_token}` — a route that does not
 * exist. Any role the chain did not name, which meant RMA, was sent to a 404
 * immediately after successfully creating a ticket.
 *
 * That is the exact failure this module was written to prevent: the comment at
 * the top describes the `/login -> /login` loop a default branch produced. The
 * switch below is exhaustive over `Portal`, so a new portal without a list
 * fails `tsc` rather than silently inheriting someone else's route.
 */
export function ticketsListHrefForPortal(portal: Portal): string {
  switch (portal) {
    case "admin":
      return "/admin/tickets";
    case "technician":
      return "/technician/tickets";
    case "sales":
      return "/sales/tickets";
    case "rma":
      return "/rma/tickets";
    case "toko":
      return "/toko/tickets";
    case "stok":
      return "/stok/rakitan";
    case "finance":
      return "/finance/klaim";
    case "customer":
      return "/customer/tickets";
    default: {
      const _exhaustive: never = portal;
      return `/${String(_exhaustive)}`;
    }
  }
}

/** Same, for a role that arrives as a plain string (a session claim). */
export function ticketsListHrefForRoleName(role: string): string {
  const destination = destinationForRoleName(role);
  return destination.allowed
    ? ticketsListHrefForPortal(destination.portal)
    : DENIED_DESTINATION;
}

// ── The public, customer-facing ticket page ─────────────────────────────────

/**
 * The URL a customer is given to follow their ticket.
 *
 * Keyed on `public_share_token`, not on `ticket_code`. Codes run
 * NGW-000001..NGW-000372 with no gaps, and the date segment is decorative — the
 * lookup never read it — so a code-based URL let anyone count upwards and read
 * every customer's device name, serial number, complaint and chat history. The
 * token is random and unique, so a link only opens the ticket it was issued for.
 *
 * Returns null when the ticket has no token, which is the caller's signal to
 * offer no link at all rather than a broken one. Every ticket on record has one.
 *
 * Six call sites built this string by hand before this existed, across three
 * portals, and all six are also what goes into the WhatsApp message sent to the
 * customer.
 */
export function publicTicketPath(
  createdAt: Date,
  shareToken: string | null,
  shortCode?: string | null,
): string | null {
  // With a short code (every ticket since the 2026-11-03 migration) the link
  // is /t/[code], about half the length in a WhatsApp message. The long form
  // keeps working for the links customers already have.
  if (shortCode) return `/t/${shortCode}`;
  if (!shareToken) return null;
  return `/${createdAt.toISOString().split("T")[0]}/${shareToken}`;
}

/**
 * True when `pathname` is a public ticket page.
 *
 * The proxy needs this to let an anonymous visitor through. Deliberately tight:
 * an ISO date, then one token segment, and nothing else — so it opens the
 * tracking page without opening anything that happens to have two segments.
 *
 * It replaces `PUBLIC_ROUTES`, a constant that was declared in proxy.ts and
 * never read, while the guard it was meant to drive allowed `/ticket` — a route
 * that has never existed. Every customer who followed a link from WhatsApp
 * landed on the login page instead.
 */
const PUBLIC_TICKET_PATH = /^\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]+\/?$/;

/** The short form, /t/[code]: one code segment of 8–32 url-safe characters. */
const PUBLIC_TICKET_SHORT_PATH = /^\/t\/[A-Za-z0-9_-]{8,32}\/?$/;

export function isPublicTicketPath(pathname: string): boolean {
  return PUBLIC_TICKET_PATH.test(pathname) || PUBLIC_TICKET_SHORT_PATH.test(pathname);
}

// ── Where a notification about a ticket should link to ──────────────────────
export function ticketHrefForPortal(portal: Portal, ticketId: string): string {
  switch (portal) {
    case "technician":
      return `/technician/tickets/${ticketId}`;
    case "admin":
      return `/admin/tickets/${ticketId}`;
    case "rma":
      // Notifications only carry ticket_id, so this route resolves the RmaCase.
      return `/rma/tickets/${ticketId}`;
    case "toko":
      // Read only: the kepala toko's own view of the ticket.
      return `/toko/tickets/${ticketId}`;
    case "stok":
      return `/stok/tickets/${ticketId}`;
    case "finance":
      return `/finance/tickets/${ticketId}`;
    case "sales":
      // Left as-is on purpose: this is wrong (the customer portal has no routes)
      // but fixing it belongs to the separate fix/sales-redirect PR, not here.
      return `/customer/tickets/${ticketId}`;
    case "customer":
      return `/customer/tickets/${ticketId}`;
    default: {
      const _exhaustive: never = portal;
      return `/customer/tickets/${String(_exhaustive)}`;
    }
  }
}
