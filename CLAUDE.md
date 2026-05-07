@AGENTS.md

# HNS IT Center — Role-Based Ticketing System: Project Handoff

## 🧭 Project Overview

A full-stack **role-based service ticketing system** for a computer repair/upgrade shop. Built with Next.js 16, Prisma 7, Supabase (Postgres + Storage), and Tiptap rich text.

**Live Dev Server:** `http://localhost:3000` (run `npm run dev`)  
**Root path:** Redirects to the correct portal based on role (see `/app/page.tsx`)

---

## 🔑 Dummy Accounts (Already Seeded)

| Role              | Email                  | Password      | Notes                          |
| ----------------- | ---------------------- | ------------- | ------------------------------ |
| **Administrator** | `admin@techserve.id`   | `admin123`    | Full system access             |
| **Technician**    | `budi@techserve.id`    | `tech123`     | Morning shift, Mon–Fri         |
| **Technician**    | `siti@techserve.id`    | `tech123`     | Noon shift, Mon/Wed/Fri/Sat    |
| **Technician**    | `agus@techserve.id`    | `tech123`     | Morning shift, Tue/Thu/Sat/Sun |
| **Sales**         | `sales@techserve.id`   | `sales123`    | Goes to Customer portal        |
| **Customer**      | `customer@example.com` | `customer123` | Name: John Doe                 |

To re-seed at any time: `$env:NODE_TLS_REJECT_UNAUTHORIZED="0"; npm run seed`

---

## 🛠️ Tech Stack

| Layer         | Technology                                                        |
| ------------- | ----------------------------------------------------------------- |
| Framework     | Next.js 16.2.4 (App Router, Turbopack)                            |
| Language      | TypeScript                                                        |
| ORM           | Prisma 7.8.0                                                      |
| DB Adapter    | `@prisma/adapter-pg` (PrismaPg) — **required for Prisma 7**       |
| Database      | Supabase Postgres (Session Pooler, port 5432)                     |
| File Storage  | Supabase Storage (bucket: `attachments`)                          |
| Auth          | Custom JWT sessions via `jose` (cookie: `session`)                |
| Rich Text     | Tiptap v3 (`@tiptap/react`, StarterKit, Image, Link, Placeholder) |
| Styling       | Vanilla CSS (`app/globals.css`) for existing components + Tailwind v4 for new pages |
| UI Components | Lucide React icons, react-hot-toast                               |
| Routing Guard | `proxy.ts` (Next.js 16 replacement for `middleware.ts`)           |

---

## ⚙️ Environment Variables (`.env.local`)

```env
# Copy this section into your own .env.local file and fill in your values

DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[DB_PASSWORD]@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=no-verify"

NEXT_PUBLIC_SUPABASE_URL="https://[PROJECT_REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"

SESSION_SECRET="generate-a-random-32+-char-string-here"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

> **Important:** `sslmode=no-verify` is intentional — the Supabase session pooler uses a self-signed cert chain. Using `sslmode=require` causes a TLS error.

---

## 🗄️ Database Schema Summary (`prisma/schema.prisma`)

### Key Models

| Model                    | Purpose                                                        |
| ------------------------ | -------------------------------------------------------------- |
| `User`                   | All roles: Administrator, Technician, Sales, Customer          |
| `Ticket`                 | Core ticket with FK to user, technician, sales                 |
| `TicketServiceDetail`    | Exists for `service` type tickets                              |
| `TicketWarrantyDetail`   | Has `purchase_date` for `warranty_claim` tickets               |
| `TicketCleaningDetail`   | Has `service_package` (Deep_Clean / Repaste)                   |
| `TicketUpgradeDetail`    | Join table — ticket ↔ Upgrade items                            |
| `Upgrade`                | Catalog of upgrade types with point cost (`name` is `@unique`) |
| `TicketPcBuildDetail`    | Header for `pc_build` tickets                                  |
| `TicketPcBuildComponent` | Components list for a PC build ticket                          |
| `TicketAttachment`       | File URLs from Supabase Storage                                |
| `TicketMessage`          | Chat/comment messages between users                            |
| `TicketStatusLog`        | Audit trail of all status changes                              |
| `TechnicianWorkload`     | Tracks `current_points` vs `max_points` (default 7)            |
| `TechnicianPerformance`  | Tracks tickets handled, success/fail counts, total points      |
| `Leaderboard`            | Monthly snapshot of technician rankings                        |
| `Notification`           | In-app alerts for status updates and messages                  |

### Enums

- `Role`: `Administrator | Technician | Sales | Customer`
- `Shift`: `morning | noon`
- `TicketType`: `service | warranty_claim | pc_build | cleaning | upgrade`
- `TicketStatus`: `waiting | on_progress | cancelled | rejected | done`
- `DeviceType`: `PC_Office | PC_Gaming | Laptop_Office | Laptop_Gaming`
- `CleaningPackage`: `Deep_Clean | Repaste`

### Point System

| Ticket Type | Points |
| ----------- | ------ |
| `pc_build`  | 4      |
| `service`   | 3      |
| all others  | 2      |

Max workload per technician: **7 points** (configurable per user via admin).

---

## 📁 File Structure

```
ticket-app-2/
├── app/
│   ├── actions/
│   │   ├── admin.ts          # createUser, updateUser, deleteUser, assignTicket,
│   │   │                     # updateTicketStatus, snapshotLeaderboard
│   │   ├── auth.ts           # loginAction, registerAction, logoutAction
│   │   ├── customer.ts       # updateProfileAction (customer)
│   │   ├── profile.ts        # updateTechnicianProfileAction, updateAdminProfileAction
│   │   ├── technician.ts     # takeTicketAction, updateTicketStatusAction
│   │   └── tickets.ts        # createTicketAction, sendMessageAction,
│   │                         # markMessagesReadAction, uploadAttachmentsAction
│   ├── admin/
│   │   ├── dashboard/page.tsx
│   │   ├── leaderboard/page.tsx      # Live leaderboard (from TicketStatusLog)
│   │   ├── profile/page.tsx          # Admin profile editor
│   │   ├── tickets/
│   │   │   ├── page.tsx               # All-tickets list with search/filter
│   │   │   └── [id]/
│   │   │       ├── page.tsx           # Full ticket detail (.ticket-detail-grid)
│   │   │       ├── AdminAssignPanel.tsx
│   │   │       └── AdminStatusPanel.tsx
│   │   ├── users/
│   │   │   ├── page.tsx
│   │   │   ├── create/
│   │   │   │   ├── page.tsx
│   │   │   │   └── CreateUserForm.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── EditUserForm.tsx
│   │   └── performance/
│   │       ├── page.tsx               # Month/year filter, period-aggregated stats
│   │       └── LeaderboardSnapshot.tsx
│   ├── customer/
│   │   ├── dashboard/page.tsx         # Stat cards + recent tickets (max 5)
│   │   ├── profile/page.tsx           # Customer profile editor
│   │   └── tickets/
│   │       ├── page.tsx               # Paginated (10/page), table+card responsive
│   │       ├── create/
│   │       │   ├── page.tsx
│   │       │   └── CreateTicketForm.tsx   # 4-step multi-form, +62 phone prefix
│   │       └── [id]/
│   │           ├── page.tsx               # .ticket-detail-grid, attachment viewer
│   │           └── TicketChat.tsx
│   ├── technician/
│   │   ├── dashboard/
│   │   │   ├── page.tsx
│   │   │   └── TakeTicketButton.tsx
│   │   ├── leaderboard/page.tsx       # Live leaderboard (from TicketStatusLog)
│   │   ├── profile/page.tsx           # Technician profile with perf stats
│   │   └── tickets/
│   │       ├── page.tsx               # Paginated (10/page), table+card responsive
│   │       └── [id]/
│   │           ├── page.tsx           # .ticket-detail-grid
│   │           └── StatusUpdater.tsx  # Confirm modal before status change
│   ├── api/
│   │   └── notifications/route.ts
│   ├── login/page.tsx         # plain <img> logo, required attrs, native validation
│   ├── register/page.tsx      # +62 prefix, terms checkbox, required attrs
│   ├── page.tsx               # Root redirect by role
│   ├── layout.tsx             # Root layout (Inter font, Toaster)
│   └── globals.css            # Full design system (vanilla CSS, ~1076 lines)
├── components/
│   ├── layout/
│   │   ├── DashboardShell.tsx    # Sidebar + topbar, collapse, logo, profile dropdown
│   │   └── NotificationBell.tsx  # Fixed-position popup (mobile-safe)
│   └── ui/
│       ├── Badge.tsx
│       ├── FileUpload.tsx
│       ├── Modal.tsx
│       ├── ProfileForm.tsx        # Shared profile form (name/email/phone/address)
│       ├── RichTextEditor.tsx
│       └── TagInput.tsx
├── lib/
│   ├── db.ts
│   ├── session.ts
│   └── supabase.ts
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── prisma.config.ts
├── proxy.ts
└── package.json
```

---

## 🔧 Critical Fixes Applied (Know Before Touching These)

### 1. Prisma 7 — No More `datasources` Option

Prisma 7 removed `datasources` from the `PrismaClient` constructor. The **only** way to pass a DB URL is via `prisma.config.ts` (for CLI) and `@prisma/adapter-pg` (for runtime).

**`lib/db.ts`** — Always use this pattern:

```ts
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const db = new PrismaClient({ adapter });
```

**`prisma/seed.ts`** — Same pattern, plus `import { config } from "dotenv"` + `config({ path: ".env.local" })`.

### 2. Supabase TLS / SSL

The session pooler uses a self-signed certificate. You must:

- Set `sslmode=no-verify` in the DATABASE_URL, AND
- Pass `ssl: { rejectUnauthorized: false }` in PrismaPg options
- When running seed manually: prefix with `$env:NODE_TLS_REJECT_UNAUTHORIZED="0"`

### 3. Next.js 16 — `middleware.ts` → `proxy.ts`

Next.js 16 deprecated `middleware.ts`. The file is now `proxy.ts` and the exported function must be named `proxy` (not `middleware`). The `config.matcher` export works identically.

### 4. Tiptap SSR Hydration Error

Tiptap v3 causes a React hydration mismatch in Next.js SSR. Fix: always pass `immediatelyRender: false` to `useEditor()`.

```ts
const editor = useEditor({
  immediatelyRender: false,  // ← required
  extensions: [...],
  ...
});
```

### 5. CSS — No `@import` Inside CSS (Tailwind Removed)

The project originally had `@import "tailwindcss"` which broke the PostCSS pipeline when combined with Google Fonts `@import`. Both were removed from `globals.css`. Google Fonts is now loaded via `<link>` tags in `app/layout.tsx`.

### 6. `Upgrade.name` Must Be `@unique`

The seed uses `upsert({ where: { name } })` so the `Upgrade` model must have `name String @unique` in the schema.

---

## 🔄 Status Flow

```
waiting ──→ on_progress ──→ done
    │              └───────→ cancelled
    └──→ rejected
```

- **Customer** creates tickets (status starts at `waiting`)
- **Technician** can "Take Ticket" (moves to `on_progress`) then mark `done` or `cancelled`
- **Admin** can approve (`on_progress`), reject, mark done, or cancel at any stage
- Each transition logs to `TicketStatusLog` and creates a `Notification` for the customer

---

## 🔔 Notification System

- Stored in `Notification` table
- Polled via `GET /api/notifications` route
- `NotificationBell` component in the topbar polls and displays unread count
- Types: `message` (new chat), `status_update` (ticket status changed)
- **Not real-time** — uses polling. Supabase Realtime not yet wired.

---

## 📋 Remaining / Suggested Work

- [ ] **Admin user delete** — button exists in user list but needs confirmation modal
- [ ] **Real-time notifications** — upgrade from polling to Supabase Realtime channels
- [ ] **Ticket point totals** — `total_points` on Ticket is not auto-calculated; set on creation
- [ ] **Supabase Storage bucket** — bucket named `attachments` must be created with **public** read access
- [ ] **Production deployment** — switch to Supabase direct DB URL + proper certificates for prod

---

## 🚀 Running the Project

```bash
npm install
npx prisma db push
$env:NODE_TLS_REJECT_UNAUTHORIZED="0"; npm run seed
npm run dev
# → http://localhost:3000
```

---

## 🏗️ ACTIVE SPRINT — HNS IT Center Feature Upgrade

> **Styling strategy:** Tailwind v4 (`@import "tailwindcss"` in globals.css) is now ACTIVE.
> Use Tailwind classes for ALL NEW components/pages. Existing vanilla CSS components are left as-is.
> Both systems coexist — do NOT remove existing CSS classes like `.card`, `.btn`, `.form-input` etc.

### Legend
- ✅ Done
- 🔄 In Progress  
- ⬜ Not Started

---

### SETUP
| # | Task | Status | Notes |
|---|------|--------|-------|
| S1 | Install / enable Tailwind v4 | ✅ | Added `@import "tailwindcss"` to globals.css — already had `tailwindcss@^4` + `@tailwindcss/postcss` in package.json |
| S2 | Schema: add `assigned` + `completed` to `NotificationType` enum | ✅ | Done — `prisma/schema.prisma` updated, `db push` + `generate` run |

---

### SYSTEM / SECURITY
| # | Task | Status | Notes |
|---|------|--------|-------|
| SY1 | Session cookie → session-only (destroy on browser close) | ✅ | Done — `lib/session.ts` `createSession` has no `expires`, JWT still has 7d expiry as guard |
| SY2 | Move file upload to server-side API route | ✅ | Already done — `uploadAttachmentsAction` in `app/actions/tickets.ts` is a `"use server"` action using `createServerSupabaseClient()` with `SUPABASE_SERVICE_ROLE_KEY`. Key never sent to browser. |

---

### BRANDING / UI SHELL
| # | Task | Status | Notes |
|---|------|--------|-------|
| B1 | Replace app name "TechServe" → "HNS IT Center" logo | ✅ | login, register, DashboardShell all updated. Logo from `public/logo-hns.jpg`. |
| B2 | Sidebar: collapsible icon-only mode (desktop) | ✅ | DashboardShell.tsx rewritten with `collapsed` state, `localStorage` persistence, 64px icon-only mode. |
| B3 | Sidebar: mobile 3/4 width (not full-screen) | ✅ | `globals.css` — sidebar is `75vw` max 300px on mobile so the exposed edge is tappable to close. Overlay `onClick` closes it. |
| B4 | Profile badge → dropdown with Sign Out / Profile / My Tickets | ✅ | DashboardShell.tsx — avatar pill opens popover dropdown with click-outside close. |

---

### CUSTOMER SIDE
| # | Task | Status | Notes |
|---|------|--------|-------|
| C1 | Customer profile page | ✅ | Created `app/customer/profile/page.tsx` + `CustomerProfileForm.tsx` + `app/actions/customer.ts#updateProfileAction`. |
| C2 | Phone input: +62 prefix, number only, no scroll | ✅ | `CreateTicketForm.tsx` Step 1 — static +62 prefix badge, `inputMode="numeric"`, `onWheel` blur, stores as `+62XXX`. |
| C3 | Hardware Upgrade: remove points display | ✅ | All ticket detail pages — removed `{u.points} pts` span from upgrade badge display. |
| C4 | Ticket view: mobile single-column layout | ✅ | `app/customer/tickets/[id]/page.tsx` — uses `.ticket-detail-grid` CSS class (collapses to 1-col at ≤768px). |
| C5 | Ticket view: better attachment display | ✅ | Shows filename, thumbnail for images, icons for PDF/Video/Other using Lucide icons. |

---

### TECHNICIAN SIDE
| # | Task | Status | Notes |
|---|------|--------|-------|
| T1 | Confirmation dialog before Done/Cancel | ✅ | `StatusUpdater.tsx` rewritten — shows modal with action description before calling `updateTicketStatusAction`. |
| T2 | Leaderboard: game-style podium + bar chart | ✅ | `app/technician/leaderboard/page.tsx` rewritten with podium (2nd/1st/3rd), crown icons, glowing 1st place avatar, relative bars for the rest. |
| T3 | Technician notifications (assignment + completion) | ✅ | `app/actions/technician.ts` — `takeTicketAction` sends `assigned` notif; `updateTicketStatusAction` done sends `completed` notif with points. `NotificationBell` routes by role. |

---

### ADMIN SIDE
| # | Task | Status | Notes |
|---|------|--------|-------|
| A1 | Admin leaderboard page (missing) | ✅ | Created `app/admin/leaderboard/page.tsx` — same game-style podium design as technician leaderboard. |
| A2 | Admin performance: period filter | ✅ | `app/admin/performance/page.tsx` rewritten — month/year search params; period mode aggregates from `TicketStatusLog`; default shows all-time `TechnicianPerformance`. |
| A3 | Admin dashboard: vertical 1-column layout | ✅ | `app/admin/dashboard/page.tsx` — fully vertical flex layout, no side-by-side grids. Stats use `.admin-stats-grid` (auto-fill 150px, 2-col on mobile). |

---

### BUG FIXES (Session 2026-05-04)
| # | Bug | Status | Notes |
|---|-----|--------|-------|
| BF1 | TypeScript errors (phone_number, changed_at, workload include) | ✅ | Fixed: `phone` → `phone_number` in `actions/customer.ts`; `changed_at` → `created_at` in performance page; removed invalid Prisma `include` fields. |
| BF2 | Technician self-assign error | ✅ | Skip customer notification when `ticket.user_id === session.userId` in `takeTicketAction` + `updateTicketStatusAction`. |
| BF3 | Horizontal scroll on mobile list pages | ✅ | Table/card toggle using `.admin-ticket-table` / `.admin-ticket-cards` CSS classes on all list pages. |
| BF4 | Logo image error: `/Logo HNS IT Center.jpg` null | ✅ | Renamed to `public/logo-hns.jpg`. Updated all references. |

---

### SPRINT 2026-05-05 SESSION 2 — Mobile UX, Leaderboard & Profiles
| # | Task | Status | Notes |
|---|------|--------|-------|
| S1 | Sidebar closed + mobile blank space bug | ✅ | `globals.css` — `.dashboard-main` on mobile now uses `margin-left: 0 !important` to override `.sidebar-collapsed` margin. |
| S2 | Logo display fix | ✅ | `DashboardShell.tsx` — switched from `<Image>` to plain `<img>` for logo to avoid Next.js hydration/optimization issues. Always visible regardless of collapsed state. |
| S3 | Sidebar toggle arrow outside sidebar | ✅ | `DashboardShell.tsx` — `.sidebar-collapse-btn` moved outside sidebar logo div, positioned as `absolute right: -12px` floating element. `sidebar` has `overflow: visible`. |
| S4 | All "TechServe" → "HNS IT Center" branding | ✅ | Fixed in: `app/layout.tsx`, all metadata titles in admin/users, admin/users/create, admin/users/[id], customer/tickets/create pages. |
| S5 | Stat card inline (icon + text horizontally) | ✅ | `globals.css` — `.stat-card` now `flex-direction: row`. Added `.stat-card-icon`, `.stat-card-body`, `.stat-card-value`, `.stat-card-label` classes. Customer dashboard uses `.customer-stats-grid` (2-col mobile, 4-col desktop). |
| S6 | Recent Tickets mobile card view (Dashboard) | ✅ | `app/customer/dashboard/page.tsx` — uses `.admin-ticket-table` / `.admin-ticket-cards` toggle, max 5 tickets, card view on mobile. |
| S7 | My Tickets pagination (per 10) | ✅ | `app/customer/tickets/page.tsx` — paginated with `take: 10, skip`, prev/next controls, total count display. |
| S8 | Technician tickets: card view + pagination | ✅ | `app/technician/tickets/page.tsx` — same pattern as customer tickets (table/card toggle, 10 per page). |
| S9 | Ticket detail upgrade: hide points | ✅ | Removed `({u.upgrade.points} pts)` from customer, technician, and admin ticket detail pages. |
| S10 | Attachments: image display fix | ✅ | `file_type` is a Prisma `FileType` enum (`image\|video\|pdf`), so direct enum comparison works correctly. |
| S11 | Technician/Admin ticket detail: 1-col mobile | ✅ | Both `app/technician/tickets/[id]/page.tsx` and `app/admin/tickets/[id]/page.tsx` now use `.ticket-detail-grid` class. |
| S12 | Technician profile page | ✅ | Created `app/technician/profile/page.tsx` with stats (handled/success/fail/points), workload bar, editable form. `app/actions/profile.ts#updateTechnicianProfileAction`. |
| S13 | Admin profile page | ✅ | Created `app/admin/profile/page.tsx` with total tickets/users stats, editable form. `app/actions/profile.ts#updateAdminProfileAction`. |
| S14 | Leaderboard: live data (not snapshot) | ✅ | Both `technician/leaderboard/page.tsx` and `admin/leaderboard/page.tsx` now query `TicketStatusLog` for real-time data. No manual admin snapshot needed. |
| S15 | Leaderboard: all technicians (including 0 pts) | ✅ | Fetches all `Technician` users, merges with activity map, shows 0 for those without completed tickets. |
| S16 | Leaderboard: game-style UI + animated bars | ✅ | `growBar` keyframe animation, `countUp` animation, `leaderboard-layout` CSS (70/30 desktop, 1-col mobile). |

---

### SPRINT 2026-05-05 SESSION 3 — Auth, UX Polish & Leaderboard Enhancements
| # | Task | Status | Notes |
|---|------|--------|-------|
| P1 | Logo broken on Login + Register pages | ✅ | Both pages: replaced `<Image>` component with plain `<img>` tag (same fix as DashboardShell). `/logo-hns.jpg` is in `/public`. |
| P2 | Form validation: prevent submit if data invalid | ✅ | Added HTML5 `required`, `minLength`, `type="email"` attrs on all inputs. Browser blocks submission natively without JS. |
| P3 | Register: +62 phone prefix | ✅ | `app/register/page.tsx` — same pattern as CreateTicketForm: `+62` badge span, number-only input (controlled), hidden `<input name="phone_number">` holds full `+62XXX` value. |
| P4 | Register: Terms & Conditions checkbox | ✅ | Styled `<label>` with ShieldCheck icon, `required` on checkbox, submit button `disabled` while unchecked. |
| P5 | Notification popup overflows left on mobile | ✅ | `NotificationBell.tsx` — changed from `position: absolute; right: 0` to `position: fixed; right: 0.5rem; top: topbar_height; width: min(320px, calc(100vw - 1rem))`. `zIndex: 200`. |
| P6 | Sidebar logo position when collapsed is weird | ✅ | `DashboardShell.tsx` — `justifyContent: collapsed ? "center" : "flex-start"` on `.sidebar-logo` div. |
| P7 | Stat card UI reverted to original vertical layout | ✅ | `globals.css` — `.stat-card` back to `flex-direction: column`, original font sizes, no `flex-shrink` / `overflow: hidden`. |
| P8 | Leaderboard: "All months" filter option | ✅ | Both leaderboard pages: `month` param is now `null` when "all" is selected. Query uses full-year date range (`Jan 1 → Jan 1 next year`). |

---

### SPRINT 2026-05-07 SESSION 1 — Bug Fixes & Feature Expansions
| # | Task | Status | Notes |
|---|------|--------|-------|
| F1 | Lock "For Myself" toggle | ✅ | `CreateTicketForm.tsx` — disabled buttons + opacity when `step > 1`. |
| F2 | Sidebar mobile bug & UI | ✅ | `globals.css` — `.sidebar-collapse-btn` styled and `.sidebar.collapsed` constrained to desktop media query. |
| F3 | Performance detailed report | ✅ | `app/admin/performance/page.tsx` — calculated avg duration from `on_progress` to `done` logs and displayed per category. |
| F4 | Admin Logs tab | ✅ | `app/admin/logs/page.tsx` — new paginated table with filters for date, status, search by ticket code/user. Added to `DashboardShell.tsx`. |
| F5 | Finish/Reject attachments & reason | ✅ | `StatusUpdater.tsx` UI and `updateTicketStatusAction` migrated to `FormData` to handle `reason` and file uploads. |
| F6 | PC Build attachments | ✅ | `CreateTicketForm.tsx` & `createTicketAction` — added `FileUpload` to PC Build step and handled in server action via `FormData`. |
| F7 | New Device & Upgrade Types | ✅ | Schema updated: `Company`, `Internet_Cafe` DeviceTypes. Upserted `Casing Upgrade`, `ARGB Configuration`. Added `reason String?` to `TicketStatusLog`. |
| F8 | Customer Contact Buttons (WhatsApp/Email) | ✅ | Added WA/Email quick buttons for "For Someone Else" tickets. |
| F9 | PDF Report Polish | ✅ | Fixed margins, page breaks, and dynamic titles ("Of the Month/Year"). |
| F10 | Available Tickets Sorting | ✅ | New `AvailableTickets.tsx` client component with date sorting. |
| F11 | Achievement System | ✅ | "Technician of the Month" trophy on profile and dashboard badge. |

---

### 🔒 SECURITY: RLS (Row Level Security)
Supabase RLS has **not yet been enabled** on any tables. Here is what needs to be done manually in the Supabase SQL Editor:

```sql
-- Step 1: Enable RLS on all tables
ALTER TABLE "User"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Ticket"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TicketAttachment"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TicketMessage"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TicketStatusLog"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TechnicianWorkload"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TechnicianPerformance"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Leaderboard"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TicketServiceDetail"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TicketWarrantyDetail"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TicketCleaningDetail"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TicketUpgradeDetail"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TicketPcBuildDetail"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TicketPcBuildComponent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Upgrade"                ENABLE ROW LEVEL SECURITY;

-- Step 2: Block all anon/public access (service_role bypasses RLS automatically)
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('CREATE POLICY "deny_anon_%s" ON %I FOR ALL TO anon USING (false)', t, t);
  END LOOP;
END $$;
```

**Why this is safe:** The app uses `SUPABASE_SERVICE_ROLE_KEY` in `lib/db.ts` (server-only). The service role bypasses RLS automatically, so no app code changes are needed. All writes go through server actions, never the anon key.

---

### HOW TO RESUME IN A NEW SESSION

1. Read this file (`CLAUDE.md`) — it is the source of truth
2. Check the sprint tables above — find any ⬜ or 🔄 items
3. Before coding, **read the actual source file** to verify it matches the Notes column (they can drift)
4. Mark items 🔄 when starting, ✅ when done
5. Always run `npx tsc --noEmit` before committing — TypeScript must compile clean
6. Commit after each logical group

**Key constraint reminders:**
- **Routing guard:** `proxy.ts` (not `middleware.ts`), exported function named `proxy` (not `middleware`)
- **Prisma 7:** Never use `datasources` option — use `@prisma/adapter-pg` pattern in `lib/db.ts`
- **Tiptap:** Always pass `immediatelyRender: false` to `useEditor()`
- **CSS imports:** `@import "tailwindcss"` is line 1 of `globals.css`. Never add Google Fonts `@import` to CSS — put font `<link>` tags in `app/layout.tsx`
- **Tailwind v4:** Uses `@import "tailwindcss"` directive — NOT the old `@tailwind base/components/utilities`
- **Styling convention:** Existing components use vanilla CSS classes (`.card`, `.btn`, `.form-input`). New pages/components may use Tailwind utility classes
- **Logo:** Always use plain `<img src="/logo-hns.jpg">` — NOT Next.js `<Image>` component (causes hydration issues in sidebar/auth pages)
- **`session.ts`** has `import "server-only"` — never import it from client components
- **Stat cards:** Use `.stat-card > .stat-card-icon + .stat-card-body > (.stat-card-value + .stat-card-label)` — vertical column layout
- **Leaderboard data:** Comes from `TicketStatusLog` where `new_status = "done"`, NOT from the `Leaderboard` snapshot table (which is legacy)
- **Point system:** `pc_build = 4pts, service = 3pts, all others = 2pts` — computed in page server component, not stored on `Ticket`
- **Phone numbers:** Always stored as `+62XXXXXXXXX` format. The `+62` prefix widget is used in `CreateTicketForm` and `register/page.tsx`
- **Notification bell:** Uses `position: fixed` (not `absolute`) to prevent mobile overflow

