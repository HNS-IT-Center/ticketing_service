/**
 * The sidebar, one list for everyone (owner, 2026-11-11): grouped by what a
 * page is for, and each person sees exactly the pages they may open. Which
 * pages that is comes from Pengaturan Akses (lib/access.ts); the pages check
 * the same capability themselves (lib/page-access.ts), so the menu and the
 * door never disagree.
 *
 * Pure: the server decides with `navFor` and hands the shell plain data —
 * icons travel as names and the client maps them to components.
 */
import type { Role } from "@prisma/client";
import type { Capability } from "@/lib/access";
import { destinationForRole, type Portal } from "@/lib/routes";

export type NavIcon =
  | "dashboard"
  | "ticket"
  | "plus"
  | "list"
  | "shield"
  | "chart"
  | "gauge"
  | "check"
  | "cpu"
  | "package-search"
  | "landmark"
  | "trending"
  | "target"
  | "trophy"
  | "package"
  | "calendar"
  | "contact"
  | "history"
  | "store"
  | "users"
  | "truck"
  | "settings"
  | "database"
  | "barcode";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Other paths that belong to this entry, e.g. a case page reached from the RMA dashboard. */
  also?: string[];
};

export type NavSection = {
  key: string;
  title?: string;
  icon?: NavIcon;
  defaultOpen?: boolean;
  items: NavItem[];
};

/**
 * Who sees an entry. `cap`: anyone the access settings allow. `roles`: a page
 * that belongs to the role itself (a technician's own tickets). Both: only
 * those roles, and only when allowed.
 */
type Rule = { cap?: Capability; anyCap?: Capability[]; roles?: Role[] };

type Entry = Omit<NavItem, "href"> & {
  rule: Rule;
  /** Where it goes; per portal when each role has its own copy of the page. */
  href: string | Partial<Record<Portal, string>> & { default?: string };
};

type Group = { key: string; title?: string; icon?: NavIcon; defaultOpen?: boolean; entries: Entry[] };

const GROUPS: Group[] = [
  {
    key: "tickets",
    title: "Tiket",
    icon: "ticket",
    defaultOpen: true,
    entries: [
      { label: "Semua Tiket", icon: "ticket", href: "/admin/tickets", rule: { cap: "page_tickets_all" } },
      // Units typed at intake, waiting for their Accurate item (owner, 2026-11-12).
      { label: "Lengkapi Kode Barang", icon: "barcode", href: "/admin/tickets/kode-barang", rule: { cap: "edit_ticket" } },
      {
        label: "Tiket Saya",
        icon: "ticket",
        href: { technician: "/technician/tickets", sales: "/sales/tickets" },
        rule: { roles: ["Technician", "Sales"] },
      },
      { label: "Tiket Toko", icon: "ticket", href: "/toko/tickets", rule: { cap: "page_toko_tickets", roles: ["StoreSupervisor", "Administrator"] } },
      { label: "Tindak Lanjut", icon: "list", href: "/toko/tindak-lanjut", rule: { cap: "page_toko_followups", roles: ["StoreSupervisor", "Administrator"] } },
      {
        label: "Buat Tiket",
        icon: "plus",
        href: {
          admin: "/admin/tickets/create",
          technician: "/technician/tickets/create",
          sales: "/sales/tickets/create",
          rma: "/rma/tickets/create",
        },
        rule: { cap: "page_create_ticket" },
      },
    ],
  },
  {
    key: "rma",
    title: "Klaim & RMA",
    icon: "shield",
    entries: [
      { label: "Dashboard RMA", icon: "dashboard", href: "/rma/dashboard", also: ["/rma/cases"], rule: { cap: "page_rma_dashboard" } },
      { label: "Tiket Klaim", icon: "ticket", href: "/rma/tickets", rule: { cap: "page_rma_claims" } },
      { label: "Analisa Klaim", icon: "chart", href: "/rma/analisa", rule: { cap: "page_rma_analysis" } },
      { label: "Klaim Garansi Toko", icon: "shield", href: "/toko/klaim", rule: { cap: "page_toko_claims", roles: ["StoreSupervisor"] } },
    ],
  },
  {
    key: "store",
    title: "Toko & Stok",
    icon: "store",
    entries: [
      { label: "Dashboard Toko", icon: "gauge", href: "/toko/dashboard", rule: { cap: "page_toko_dashboard", roles: ["StoreSupervisor", "Administrator"] } },
      { label: "Dashboard Stok", icon: "check", href: "/stok/dashboard", rule: { cap: "page_stock_dashboard" } },
      { label: "Rakitan PC", icon: "cpu", href: "/stok/rakitan", also: ["/stok/tickets"], rule: { cap: "page_stock_builds" } },
      { label: "Part Keluar", icon: "package-search", href: "/stok/part", rule: { cap: "page_stock_parts" } },
    ],
  },
  {
    key: "finance",
    title: "Keuangan",
    icon: "landmark",
    entries: [
      { label: "Kinerja Vendor Klaim", icon: "landmark", href: "/finance/dashboard", rule: { cap: "page_finance_vendors" } },
      { label: "Klaim Stok Toko", icon: "shield", href: "/finance/klaim", also: ["/finance/tickets"], rule: { cap: "page_finance_claims" } },
    ],
  },
  {
    key: "performance",
    title: "Kinerja",
    icon: "trending",
    entries: [
      { label: "Performance", icon: "trending", href: "/admin/performance", rule: { cap: "page_performance" } },
      { label: "Target Teknisi", icon: "target", href: "/admin/reports/technicians", rule: { cap: "page_tech_targets" } },
      { label: "Kinerja Teknisi Toko", icon: "trending", href: "/toko/teknisi", rule: { cap: "page_toko_performance", roles: ["StoreSupervisor"] } },
      {
        label: "Leaderboard",
        icon: "trophy",
        href: { technician: "/technician/leaderboard", default: "/admin/leaderboard" },
        rule: { cap: "page_leaderboard" },
      },
      { label: "Laporan Part", icon: "package", href: "/admin/reports/parts", rule: { cap: "page_parts_report" } },
      { label: "Tiket Perlu Dicek", icon: "shield", href: "/admin/reports/audit", rule: { roles: ["Administrator"] } },
    ],
  },
  {
    key: "team",
    title: "Tim",
    icon: "users",
    entries: [
      { label: "Jadwal", icon: "calendar", href: "/technician/schedule", rule: { roles: ["Technician"] } },
      { label: "Jadwal Teknisi", icon: "calendar", href: "/toko/jadwal", rule: { cap: "page_toko_schedule", roles: ["StoreSupervisor"] } },
      { label: "Daftar User", icon: "contact", href: "/toko/tim", rule: { cap: "page_toko_team", roles: ["StoreSupervisor"] } },
    ],
  },
  {
    key: "log",
    entries: [{ label: "Log", icon: "history", href: "/logs", rule: { anyCap: ["page_log_ticket", "page_log_rma", "page_log_activity"] } }],
  },
  {
    key: "master",
    title: "Data Master",
    icon: "database",
    entries: [
      { label: "Stores", icon: "store", href: "/admin/stores", rule: { roles: ["Administrator"] } },
      {
        label: "Daftar Jasa",
        icon: "list",
        href: { technician: "/technician/service-jobs", default: "/admin/service-jobs" },
        rule: { cap: "manage_service_jobs" },
      },
      {
        label: "Vendor",
        icon: "truck",
        href: { technician: "/technician/vendors", rma: "/rma/vendors", default: "/admin/vendors" },
        also: ["/rma/vendors"],
        rule: { cap: "manage_vendors" },
      },
    ],
  },
  {
    key: "settings",
    // Accounts and what each role may do: one page, two tabs (owner, 2026-11-12).
    entries: [
      { label: "Pengguna & Akses", icon: "users", href: "/admin/users", also: ["/admin/settings/access"], rule: { roles: ["Administrator"] } },
    ],
  },
];

/** The dashboard a role lands on; the first entry of every sidebar. */
export function homeOf(role: Role): string | null {
  const d = destinationForRole(role);
  return d.allowed ? d.dashboard : null;
}

function hrefFor(entry: Entry, portal: Portal | null): string | null {
  if (typeof entry.href === "string") return entry.href;
  return (portal && entry.href[portal]) || entry.href.default || null;
}

function visible(rule: Rule, role: Role, can: (c: Capability) => boolean): boolean {
  if (rule.roles && !rule.roles.includes(role)) return false;
  if (rule.cap && !can(rule.cap)) return false;
  if (rule.anyCap && !rule.anyCap.some(can)) return false;
  return true;
}

/**
 * The sidebar for one person: their own dashboard first, then every group
 * holding at least one page they may open. An entry that is the person's own
 * dashboard is left out of its group rather than shown twice.
 */
export function navFor(role: Role, can: (c: Capability) => boolean): NavSection[] {
  const d = destinationForRole(role);
  if (!d.allowed) return [];
  const home = d.dashboard;
  const homeItem: NavItem = { href: home, label: "Dashboard", icon: "dashboard" };
  const sections: NavSection[] = [{ key: "home", items: [homeItem] }];
  for (const g of GROUPS) {
    const items: NavItem[] = [];
    for (const e of g.entries) {
      if (!visible(e.rule, role, can)) continue;
      const href = hrefFor(e, d.portal);
      if (!href || items.some((i) => i.href === href)) continue;
      if (href === home) {
        // Its own dashboard: the pages under it light up "Dashboard" instead.
        if (e.also) homeItem.also = [...(homeItem.also ?? []), ...e.also];
        continue;
      }
      items.push({ href, label: e.label, icon: e.icon, ...(e.also ? { also: e.also } : {}) });
    }
    if (items.length) sections.push({ key: g.key, title: g.title, icon: g.icon, defaultOpen: g.defaultOpen, items });
  }
  return sections;
}
