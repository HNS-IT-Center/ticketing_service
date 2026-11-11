import { parseCsv } from "../csv";

/**
 * Moving existing staff accounts onto HNS SSO (HNS-SSO-CLIENT.md §3.1–3.2).
 *
 * Pure: the scripts in scripts/ do the reading and writing, this decides what
 * goes in the export and which rows get linked, so both are unit tested.
 */

/** Roles that are staff. Customers are never exported to SSO and never linked. */
export const STAFF_ROLES = ["Administrator", "Technician", "Sales", "RMA", "StoreSupervisor", "StockAdmin", "Finance"] as const;

export type LocalAccount = {
  id: string;
  name: string;
  email: string;
  role: string;
  password: string | null;
  is_active: boolean;
  sso_sub: string | null;
};

const BCRYPT = /^\$2[aby]\$\d{2}\$/;
/** deactivateUserAction scrambles the email to this; such rows are not people any more. */
const DEACTIVATED_EMAIL = /__deleted__@deactivated\.local$/i;
/** Fixture domains used by this repo's tests and QC runs. */
const TEST_DOMAINS = ["qc.local", "test.local", "example.com"];

export const EXPORT_HEADER = ["email", "username", "name", "status", "password_hash"] as const;

function domainOf(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

export function isStaff(role: string): boolean {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

/**
 * The rows for SSO's "Impor CSV": staff only, no deactivated or test accounts,
 * and a password hash only when it is bcrypt — SSO accepts nothing else, and
 * anyone without one signs in with Google or gets a reset from the SSO admin.
 * `username` stays empty: this app has no usernames, and SSO derives one.
 */
export function buildExportRows(
  accounts: LocalAccount[],
  options: { excludeDomains?: string[] } = {}
): { rows: string[][]; skipped: { reason: string; count: number }[]; withPassword: number } {
  const excluded = new Set([...TEST_DOMAINS, ...(options.excludeDomains ?? [])].map((d) => d.toLowerCase()));
  const skippedCount: Record<string, number> = {};
  const skip = (reason: string) => (skippedCount[reason] = (skippedCount[reason] ?? 0) + 1);

  const rows: string[][] = [];
  let withPassword = 0;
  for (const a of accounts) {
    if (!isStaff(a.role)) { skip("bukan staf"); continue; }
    if (DEACTIVATED_EMAIL.test(a.email)) { skip("sudah dihapus"); continue; }
    if (excluded.has(domainOf(a.email))) { skip("akun uji / domain dikecualikan"); continue; }
    const hash = a.password && BCRYPT.test(a.password) ? a.password : "";
    if (hash) withPassword++;
    rows.push([a.email.trim(), "", a.name.trim(), a.is_active ? "active" : "disabled", hash]);
  }
  return {
    rows,
    skipped: Object.entries(skippedCount).map(([reason, count]) => ({ reason, count })),
    withPassword,
  };
}

// ── Linking ───────────────────────────────────────────────────────────────

export type SsoExportRow = { sub: string; username: string; email: string; name: string; status: string };

/** SSO prefixes values with `'` so Excel does not run them as formulas. */
function unguard(value: string): string {
  return value.startsWith("'") ? value.slice(1) : value;
}

/** Parse SSO's "Ekspor CSV (sub ↔ email)": `sub,username,email,name,status`. */
export function parseSsoExport(text: string): { rows: SsoExportRow[]; error: string | null } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], error: "File kosong." };
  const header = table[0].map((h) => unguard(h.trim()).toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (col("sub") < 0 || col("email") < 0) {
    return { rows: [], error: "Header tidak dikenali: harus ada kolom 'sub' dan 'email' (sub,username,email,name,status)." };
  }
  const get = (r: string[], name: string) => (col(name) >= 0 ? unguard((r[col(name)] ?? "").trim()) : "");
  const rows = table
    .slice(1)
    .map((r) => ({
      sub: get(r, "sub"),
      username: get(r, "username"),
      email: get(r, "email"),
      name: get(r, "name"),
      status: get(r, "status"),
    }))
    .filter((r) => r.sub && r.email);
  return { rows, error: null };
}

export type LinkPlan = {
  link: { userId: string; email: string; sub: string }[];
  alreadyLinked: { userId: string; email: string }[];
  notFound: SsoExportRow[];
  conflicts: { email: string; reason: string }[];
  /** Local staff SSO does not know about: not created there, or not given access. */
  localNotInSso: { userId: string; email: string; name: string }[];
};

const norm = (email: string) => email.trim().toLowerCase();

/**
 * Which local rows to tie to which SSO subject. Only ever fills `sso_sub`:
 * never changes a primary key, deletes a row, or merges two rows — two local
 * accounts for one person are an administrator's job, done by hand.
 */
export function planLinks(rows: SsoExportRow[], accounts: LocalAccount[]): LinkPlan {
  const plan: LinkPlan = { link: [], alreadyLinked: [], notFound: [], conflicts: [], localNotInSso: [] };
  const byEmail = new Map<string, LocalAccount[]>();
  for (const a of accounts) {
    const key = norm(a.email);
    byEmail.set(key, [...(byEmail.get(key) ?? []), a]);
  }
  const subOwner = new Map(accounts.filter((a) => a.sso_sub).map((a) => [a.sso_sub!, a.id]));
  const plannedSubs = new Set<string>();
  const seenEmails = new Set<string>();

  for (const row of rows) {
    const key = norm(row.email);
    seenEmails.add(key);
    const matches = byEmail.get(key) ?? [];
    if (matches.length === 0) { plan.notFound.push(row); continue; }
    if (matches.length > 1) { plan.conflicts.push({ email: row.email, reason: "email cocok ke lebih dari satu akun lokal" }); continue; }
    const a = matches[0];
    if (a.sso_sub === row.sub) { plan.alreadyLinked.push({ userId: a.id, email: a.email }); continue; }
    if (a.sso_sub) { plan.conflicts.push({ email: row.email, reason: "akun lokal sudah tertaut ke sub SSO lain" }); continue; }
    if (!isStaff(a.role)) { plan.conflicts.push({ email: row.email, reason: `akun lokal ber-role ${a.role}, bukan staf` }); continue; }
    const owner = subOwner.get(row.sub);
    if ((owner && owner !== a.id) || plannedSubs.has(row.sub)) {
      plan.conflicts.push({ email: row.email, reason: "sub SSO ini sudah dipakai akun lokal lain" });
      continue;
    }
    plannedSubs.add(row.sub);
    plan.link.push({ userId: a.id, email: a.email, sub: row.sub });
  }

  for (const a of accounts) {
    if (!isStaff(a.role) || !a.is_active || a.sso_sub || DEACTIVATED_EMAIL.test(a.email)) continue;
    if (!seenEmails.has(norm(a.email))) plan.localNotInSso.push({ userId: a.id, email: a.email, name: a.name });
  }
  return plan;
}
