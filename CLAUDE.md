@AGENTS.md

# HNS IT Center — Role-Based Ticketing System: Project Handoff

## 🤖 Agent Role
You are a **Professional Full Stack Developer** with perfect skills in Backend and Frontend Website Development. You also possess strong System Architect analytics and capabilities. Always adhere to these professional standards and architectural best practices when working in this codebase.

## 🧭 Project Overview

A full-stack **role-based service ticketing system** for a computer repair/upgrade shop. Built with Next.js 16, Prisma 7, **MariaDB**, Cloudflare R2, and Tiptap rich text.

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

To re-seed the **local** database: `npm run seed`. ⛔ Never against a shared or production
database — the seed's `upsert` writes the password in its `update` branch too, so it resets
a live `admin@techserve.id` back to `admin123` and reactivates it. Use `npm run create-user`
there. `NODE_TLS_REJECT_UNAUTHORIZED=0` is **not** needed and must not be used: it is
process-wide, disabling certificate checks for R2 and Resend as well.

---

## 🛠️ Tech Stack

| Layer         | Technology                                                        |
| ------------- | ----------------------------------------------------------------- |
| Framework     | Next.js 16.2.4 (App Router, Turbopack)                            |
| Language      | **TypeScript** (Strict Type Checking Enabled)                     |
| ORM           | Prisma 7.10.0                                                     |
| DB Adapter    | `@prisma/adapter-mariadb` via `lib/mariadb.ts` — **not** adapter-pg |
| Database      | **MariaDB 11.8.9** (Hostinger). Ported from Supabase Postgres 2026-09-28 |
| File Storage  | Cloudflare R2 (`lib/r2.ts`); MinIO locally                        |
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

# Where uploads go. "local" writes to public/uploads and needs no credentials —
# use it for local development, where R2 keys are not available. Anything else
# uses Cloudflare R2 via lib/r2.ts.
STORAGE_DRIVER="local"

# Set false when DATABASE_URL points at a plain local Postgres (no TLS).
DATABASE_SSL="false"
```

> **Important:** `sslmode=no-verify` is intentional — the Supabase session pooler uses a self-signed cert chain. Using `sslmode=require` causes a TLS error.

---

## 🗄️ Database Schema Summary (`prisma/schema.prisma`)

### Key Models

| Model                    | Purpose                                                        |
| ------------------------ | -------------------------------------------------------------- |
| `User`                   | All roles: Administrator, Technician, Sales, Customer, RMA     |
| `Ticket`                 | Core ticket with FK to user, technician, sales                 |
| `TicketServiceDetail`    | Exists for `service` type tickets                              |
| `TicketWarrantyDetail`   | `purchase_date` for `warranty_claim`, plus `claim_eligible` + `ineligibility_reason` written by the server when a technician closes a claim as not eligible |
| `TicketCleaningDetail`   | Has `service_package` (see `CleaningPackage` below)            |
| `TicketUpgradeDetail`    | Join table — ticket ↔ Upgrade items                            |
| `Upgrade`                | Catalog of upgrade types with point cost (`name` is `@unique`) |
| `TicketPcBuildDetail`    | Header for `pc_build` tickets                                  |
| `TicketPcBuildComponent` | Components list for a PC build ticket                          |
| `TicketAttachment`       | File URLs from Supabase Storage                                |
| `TicketMessage`          | Chat/comment messages between users                            |
| `TicketStatusLog`        | Audit trail of all status changes                              |
| `TechnicianWorkload`     | (Deprecated) Formerly tracked workload point limits            |
| `TechnicianPerformance`  | Tracks tickets handled, success/fail counts, total points      |
| `Leaderboard`            | (Legacy) Monthly snapshot of technician rankings               |
| `Notification`           | In-app alerts for status updates and messages                  |
| `UserTitle`              | Achievement title inventory for users (equipped via profile)   |
| `TicketAssignmentRequest`| Pending requests by technicians to claim waiting tickets        |
| `RmaCase`                | One per `warranty_claim` ticket handed to the RMA desk. Service form, vendor fields, outcome. `rma_code` is `RMA-{STORECODE}-{YYMM}-{0001}` |
| `RmaEvent`               | Audit trail of every `RmaCase` state change, with actor and note |

### Enums

- `Role`: `Administrator | Technician | Sales | Customer | RMA`
- `Shift`: `morning | noon`
- `TicketType`: `service | warranty_claim | pc_build | cleaning | upgrade`
- `TicketStatus`: `waiting | on_progress | rma_process | done | ready_for_pickup | waiting_pickup | handed_to_courier | delivered | completed | cancelled | rejected`
- `DeviceType`: `PC_Office | PC_Gaming | Laptop_Office | Laptop_Gaming | Printer | Other_Device`
- `CleaningPackage`: `Deep_Clean | Repaste | Basic_Cleaning | Full_Repaste | Full_Repaste_CPU_GPU`
- `NotificationType`: `message | status_update | assigned | completed | rma_update`
- `RmaStatus`: `pending_verification | on_hold | verified | submitted_to_vendor | in_vendor_process | vendor_decided | unit_received | closed | cancelled`
- `RmaDecision`: `repaired | replaced | refund | rejected`
- `UnitOwnership`: `customer | store_stock`

### Point System

**What is credited: `lib/points.ts`** — used by `tickets.ts`, `technician.ts`, `rma.ts`.

| Ticket Type / Condition                            | Points |
| -------------------------------------------------- | ------ |
| `service`                                          | 5      |
| `service` + `Other_Device`                         | 3      |
| `pc_build`                                         | 4      |
| `cleaning` + `Full_Repaste` / `Full_Repaste_CPU_GPU` | 5    |
| all other `cleaning`                               | 3      |
| `warranty_claim` / `upgrade` / anything else       | 2      |

⚠️ **Three other tables are still live and disagree with it.** The leaderboard, the
performance report and the technician dashboards score cleaning 2 (4 on `PC_Gaming`) and
service always 5; the two ticket-list badges do the same and add +3 per `extra_service`; and
`admin.ts` has a fourth table of its own for tickets closed by an admin or Sales. Divergent
since `0fed3b9` (2026-07-27). Unifying them shifts displayed figures and admin-credited
points, so it is its own branch — `fix/points-table-unification`. Until then: import from
`lib/points.ts` for anything new, and never assume a badge matches the leaderboard. Full
breakdown in `FLOW.md` § 4.

**When the points land — one copy: `lib/kpi.ts`.**

```
count it if  (type != 'warranty_claim' && new_status == 'done')
          || (type == 'warranty_claim' && new_status == 'rma_process')
          || (type == 'warranty_claim' && new_status == 'done'
                                       && claim_eligible == false)
```

A warranty claim has two paid exits, worth the same: handover to RMA, and being turned down
after examination. The `done` that `rma.ts` writes when a case closes earns nothing — the
handover already did — and `claim_eligible` is the only thing separating those two `done`s,
so `performanceEffect()` takes it as a third argument. `cancelled` and `rejected` add a
`failed_count` for every type. Full reasoning in `FLOW.md` § 4 and § 5.

Max workload per technician: **Removed**. Technicians can request any number of tickets, which are then approved by an Admin or Store Coordinator. Workload is dynamically tracked as "Active Tickets" (tickets in `waiting` or `on_progress` status).

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
│   │   ├── profile.ts        # updateTechnicianProfileAction, updateAdminProfileAction, equipTitleAction
│   │   ├── technician.ts     # takeTicketAction, updateTicketStatusAction, cancelTicketRequestAction
│   │   └── tickets.ts        # createTicketAction, sendMessageAction,
│   │                         # markMessagesReadAction, uploadAttachmentsAction
│   ├── admin/
│   │   ├── dashboard/page.tsx
│   │   ├── leaderboard/page.tsx      # Live leaderboard (from TicketStatusLog)
│   │   ├── profile/page.tsx          # Admin profile editor
│   │   ├── tickets/
│   │   │   ├── page.tsx               # All-tickets list with search/filter
│   │   │   ├── create/
│   │   │   │   ├── page.tsx             # Create ticket page for admin
│   │   │   └── [id]/
│   │   │       ├── page.tsx           # Full ticket detail (.ticket-detail-grid)
│   │   │       ├── AdminAssignPanel.tsx
│   │   │       ├── AdminStatusPanel.tsx
│   │   │       ├── AdminWorkflowPanel.tsx
│   │   │       └── PublicChatToggle.tsx
│   │   ├── users/
│   │   │   ├── page.tsx
│   │   │   ├── create/
│   │   │   │   ├── page.tsx
│   │   │   │   └── CreateUserForm.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── EditUserForm.tsx
│   │   └── performance/
│   │       ├── page.tsx               # Month/year/store filter, period-aggregated stats
│   │       ├── ExportToPDF.tsx        # Client-side PDF generation
│   │       ├── SharePerformance.tsx
│   │       └── LeaderboardSnapshot.tsx
│   ├── customer/
│   │   ├── dashboard/page.tsx         # Stat cards + recent tickets (max 5)
│   │   ├── profile/page.tsx           # Customer profile editor
│   │   └── tickets/
│   │       ├── page.tsx               # Paginated (10/page), table+card responsive
│   │       └── [id]/
│   │           ├── page.tsx               # .ticket-detail-grid, attachment viewer
│   │           └── TicketChat.tsx
│   ├── technician/
│   │   ├── dashboard/
│   │   │   ├── page.tsx
│   │   │   ├── AvailableTickets.tsx   # Dashboard listing with request state controls
│   │   │   └── TakeTicketButton.tsx
│   │   ├── leaderboard/page.tsx       # Live leaderboard (from TicketStatusLog)
│   │   ├── profile/page.tsx           # Technician profile with title achievements inventory
│   │   └── tickets/
│   │       ├── page.tsx               # Paginated (10/page), table+card responsive
│   │       ├── create/
│   │       │   ├── page.tsx
│   │       │   └── CreateTicketForm.tsx   # 5-step form (Store, Intake fields, T&C)
│   │       └── [id]/
│   │           ├── page.tsx           # .ticket-detail-grid
│   │           └── StatusUpdater.tsx  # Confirm modal before status change
│   ├── api/
│   │   ├── notifications/route.ts
│   │   └── ticket-requests/route.ts   # GET/POST endpoints for ticket assignment requests
│   ├── login/page.tsx         # plain <img> logo, required attrs, native validation
│   ├── register/page.tsx      # +62 prefix, terms checkbox, required attrs
│   ├── page.tsx               # Root redirect by role
│   ├── layout.tsx             # Root layout (Inter font, Toaster)
│   └── globals.css            # Full design system (vanilla CSS, Tailwind v4 imports)
│── components/
│   ├── layout/
│   │   ├── DashboardShell.tsx    # Sidebar + topbar, collapse, profile dropdown
│   │   ├── NotificationBell.tsx  # Fixed-position popup (mobile-safe)
│   │   └── RequestsBell.tsx      # Bell popover dropdown for Admins/Coordinators to accept requests
│   └── ui/
│       ├── Badge.tsx
│       ├── FileUpload.tsx
│       ├── Modal.tsx
│       ├── ProfileForm.tsx        # Shared profile form (name/email/phone/address)
│       ├── PublicShareButton.tsx  # Copies public ticket URL
│       ├── RichTextEditor.tsx
│       ├── TagInput.tsx
│       └── TermsModal.tsx         # T&C policy modal
├── lib/
│   ├── db.ts
│   ├── session.ts
│   ├── supabase.ts
│   ├── performance.ts        # Achievement calculations & caching helpers
│   └── leaderboard.ts        # Leaderboard calculation helpers
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

Prisma 7 removed `datasources` from the `PrismaClient` constructor. The DB URL arrives via `prisma.config.ts` (for the CLI) and a driver adapter (for runtime).

**The adapter is `@prisma/adapter-mariadb`, not `adapter-pg`** — the database moved to MariaDB on 2026-09-28. Connection settings live in **one** module, `lib/mariadb.ts`, shared by all seven entry points that open a client. Two of its settings are load-bearing and must not be dropped:

- **`STRICT_TRANS_TABLES` via `initSql`** — the server runs without it, so an over-long string is truncated rather than rejected. PostgreSQL rejected it; this restores that.
- **`useTextProtocol: true`** — without it every `contains` / `startsWith` search fails on the server with "Illegal mix of collations", and the failure cannot be reproduced against the local container.

**`lib/db.ts`** — Always use this pattern:

```ts
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { mariadbPoolConfig, MARIADB_ADAPTER_OPTIONS } from "./mariadb";

const adapter = new PrismaMariaDb(mariadbPoolConfig(), MARIADB_ADAPTER_OPTIONS);
const db = new PrismaClient({ adapter });
```

**`prisma/seed.ts`** — Same pattern, plus `import { config } from "dotenv"` + `config({ path: ".env.local" })`.

### 2. ~~Supabase TLS / SSL~~ — obsolete since the MariaDB port

Kept so the advice is not rediscovered from an old commit. It described the Supabase session
pooler's self-signed chain: `sslmode=no-verify`, `ssl: { rejectUnauthorized: false }`, and a
`NODE_TLS_REJECT_UNAUTHORIZED=0` prefix for the seed.

**None of it applies now.** Both MariaDB targets speak plain TCP — the local container, and
Hostinger reached through an SSH tunnel, where the tunnel provides the encryption. `DATABASE_SSL`
is opt-in (`true` only for a server that genuinely terminates TLS), and
`NODE_TLS_REJECT_UNAUTHORIZED=0` must never be used: it is process-wide and would disable
certificate checks for R2 and Resend too.

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

### 7. Next.js 16 Route Revalidation Rules

**CRITICAL Gotcha:** Do NOT call `revalidateTag` inside components during page render or inside `unstable_cache` functions. Doing so throws a Next.js runtime error: *"Route used revalidateTag during render which is unsupported"*. Revalidation must only occur inside Server Actions (`"use server"`) or API Route handlers.

For dynamic operations run during page render (such as checking/awarding monthly achievement titles), keep the corresponding database queries (e.g. `getUserTitles(userId)`) uncached. If they were cached, they would return stale data because Next.js reads the cache before the render-time DB write finishes.

---

## 🗲 Caching Strategy

The application leverages Next.js `unstable_cache` combined with tag-based revalidation using `revalidateTag("tag", "max")` to optimize database query performance:

### Cache Tags

- `leaderboard-techs`: Caches leaderboard scores for technicians.
- `leaderboard-stores`: Caches leaderboard scores for store locations.
- `tech-month-winner`: Caches the awarded top technician of the month.
- `user-profile:[userId]`: Caches technician profiles.
- `user-titles:[userId]`: Caches active titles for a specific user (revalidated upon title equip).

### Cache Invalidation

Tags are invalidated when state changes occur in the system:
- **Profile Updates:** Revalidates `user-profile:[userId]` in `updateTechnicianProfileAction`.
- **Status Changes:** Revalidates `leaderboard-techs`, `leaderboard-stores`, `tech-month-winner`, and `user-profile:[userId]` in `updateTicketStatusAction` (technician & admin).
- **Title Equipment:** Revalidates `user-titles:[userId]` and `user-profile:[userId]` in `equipTitleAction`.

---

## 🔄 Status Flow

```
waiting ──→ on_progress ──→ ready_for_pickup ──→ waiting_pickup ──→ completed
    │              └─────→ handed_to_courier ──→ delivered ─────┘
    │              └─────→ done (handover state)
    │              └─────→ cancelled
    └──→ rejected
```

- **Admin** or **Technician** creates tickets (status starts at `waiting`). Customers cannot create tickets.
- **Technician** can request to take a ticket, placing it in `waiting` with a pending request. Once approved by an Admin or Store Coordinator, status moves to `on_progress`.
- **Technician** marks a ticket `done`, uploading proof attachments, which sends it to "Awaiting Handover" or the next pickup phase.
- **Admin** can approve (`on_progress`), reject, mark done, or cancel at any stage.
- Each transition logs to `TicketStatusLog` and creates a `Notification` for the customer.

---

## 📋 Ticket Assignment Requests Flow

- **Constraint:** Only one technician can have a pending request on a ticket at a time. If Technician A requests Ticket A, other technicians see it as "Requested by other" (disabled) on their dashboard.
- **Cancellation:** A technician can cancel their pending request directly from the dashboard, which restores the ticket to the open pool.
- **Approvals:** Store Coordinators (Users with `is_team_leader: true`) and Administrators see pending counts and can approve or reject requests using the `<RequestsBell>` dropdown.
- **Real-Time updates:** The `<RequestsBell>` listens to the `TicketAssignmentRequest` table insertions using Supabase realtime WebSocket channels.

---

## 🔔 Notification System

- Stored in `Notification` table.
- Polled via `GET /api/notifications` route.
- `NotificationBell` component in the topbar displays unread count.
- Types: `message` (new chat), `status_update` (ticket status changed), `assigned` (technician assigned), `completed` (technician completed a ticket, awards points).
- **Polled, every 30s** (`POLL_MS` in `NotificationBell.tsx` / `RequestsBell.tsx`). Supabase Realtime was removed in the MariaDB port: it reads PostgreSQL's write-ahead log through Supabase, so on MariaDB a `.channel()` subscription never fires. A new notification now appears within 30 seconds rather than instantly. See `AGENTS.md` rule #9 before changing this back.

---

## 📋 Remaining / Suggested Work

> The current, maintained backlog is **`## 📋 BACKLOG`** near the bottom of this file. What
> follows is the older list, kept because a few entries are still open. Two of its items were
> obsolete and have been struck out rather than silently deleted.

- [ ] **Admin user delete** — button exists in user list but needs confirmation modal
- [x] ~~**Real-time notifications**~~ — done; `NotificationBell` uses Supabase Realtime channels
- [ ] **Ticket point totals** — `total_points` on Ticket is not auto-calculated; points are
      computed on read from `lib/points.ts`
- [x] ~~**Supabase Storage bucket**~~ — no longer applicable; file storage is Cloudflare R2
      (`lib/r2.ts`), with MinIO or `STORAGE_DRIVER=local` for development
- [ ] **Production deployment** — see BL11 and BL14 in the backlog

---

## 🚀 Running the Project

### Setup on a New Device

When cloning the project to a new device, you will need to reconfigure the environment variables and the database connection. Follow these steps:

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   - Copy `.env.example` to `.env.local`.
   - **Database — MariaDB, not Supabase.** Start a local container and point `DATABASE_URL` at it:
     ```bash
     docker run -d --name hns-ticketing-mariadb -p 127.0.0.1:3310:3306        -e MARIADB_ROOT_PASSWORD=devpass -e MARIADB_DATABASE=ticketing        -v hns-ticketing-mariadb-data:/var/lib/mysql --restart unless-stopped mariadb:11.8
     ```
     `DATABASE_URL="mysql://root:devpass@127.0.0.1:3310/ticketing"`. Leave `DATABASE_SSL` unset.
   - **Uploads:** MinIO locally — see `docs/minio-local-storage.md`, then `npm run setup:minio`.
   - Generate a random 32+ character string for `SESSION_SECRET`.
   - The `*SUPABASE*` variables are no longer read by the application and can be left out.

3. **Push Database Schema**
   Sync your Prisma schema to the local MariaDB container:
   ```bash
   npx prisma db push
   ```

4. **Seed the Database (Optional but recommended)**
   If this is a fresh database, you need to populate it with initial dummy accounts, tickets, and upgrades:
   ```bash
   npm run seed
   ```
   *(Local database only. Against anything shared, use `npm run create-user` — the seed resets
   existing passwords to the ones published in this repo.)*

5. **Start the Development Server**
   ```bash
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
| S4 | All "TechServe" → "HNS IT Center" branding | ✅ | Fixed in: `app/layout.tsx`, all metadata titles in admin/users, admin/users/create, admin/users/[id] pages. |
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

### SPRINT 2026-05-12 SESSION — Phase 2 Finalization
| # | Task | Status | Notes |
|---|------|--------|-------|
| F1 | CS Intake Flow enhancements | ✅ | Added fields to `CreateTicketForm.tsx` (Service Category, Store Selection, Accessories, Condition, Overnight, Pickup, Terms of Service). |
| F2 | Public Chat Toggle | ✅ | Created `PublicChatToggle.tsx` and integrated it into admin ticket detail page. Verified `sendPublicMessageAction`. |
| F3 | Technician Status Updater | ✅ | `StatusUpdater.tsx` now shows "Awaiting Handover" banner when done. |
| F4 | Performance Store Filter | ✅ | Added store filter to `AdminPerformancePage` and filtered technicians by their store assignments. |
| F5 | Technician Store Filtering | ✅ | Filtered unassigned tickets in `TechnicianDashboard` by technician's assigned stores. |
| F6 | Share Ticket Button | ✅ | Added `PublicShareButton` to customer ticket detail page header. |
| F7 | formatDateTime consistency | ✅ | Replaced `new Date().toLocaleString()` with `formatDateTime()` in admin logs, ticket details, etc. |

### SPRINT 2026-05-25 SESSION — Dynamic Workload & Assignments
| # | Task | Status | Notes |
|---|------|--------|-------|
| W1 | Dynamic Workload Tracking | ✅ | Removed `TechnicianWorkload` max_points logic. Profile now queries `Ticket` table for active ticket counts. `TakeTicketButton` limits removed. |
| W2 | Store Coordinator Assignments | ✅ | `adminAssignTicketAction` now accepts `is_team_leader`. Rendered `AdminAssignPanel` inside Technician portal for Store Coordinators to accept requests. |
| W3 | Supabase Realtime Notifications | ✅ | `NotificationBell.tsx` updated from 30s `setInterval` polling to Supabase `.channel('realtime:notifications').on('postgres_changes')`. |

### SPRINT 2026-05-28 SESSION — UI & Layout Refinements
| # | Task | Status | Notes |
|---|------|--------|-------|
| U1 | Technician Ticket View Alignment | ✅ | `app/technician/tickets/[id]/page.tsx` now matches the 2-column sidebar layout of the Admin view. Added `CustomerWhatsAppActions`, `PcBuildHandover`, and `AdminAssignPanel` (for Store Coordinators). |
| U2 | Assignment Panel Template | ✅ | `AdminAssignPanel.tsx` updated to structurally match the `Status History` card. Moved below Status History in the right column on both Admin and Technician views. |
| U3 | CreateTicketForm Syntax Fix | ✅ | Fixed JSX syntax errors and removed improperly nested fragment blocks in `CreateTicketForm.tsx`. |
| U4 | RichTextEditor ESLint Fix | ✅ | Extracted `ToolbarBtn` outside of `RichTextEditor` component to fix ESLint "calling setState synchronously" / component-in-render errors. |

### SPRINT 2026-05-30 SESSION — Ticketing Logic & UI Polish
| # | Task | Status | Notes |
|---|------|--------|-------|
| T1 | Ticket Creation Role Restriction | ✅ | **Important Context Rule**: Customers can no longer create tickets. Only Admins and Technicians are authorized to create tickets. |
| T2 | PC Build Revision Flexibility | ✅ | Removed `on_progress`/`waiting` gating for PC Build uploads. Revisions can now be uploaded at any time (including before the ticket is marked Done). Added a "Replace" button to swap existing uploads. |
| T3 | Real Customer Names in Dashboards | ✅ | Both Admin and Technician dashboards now respect the `is_for_self` flag, displaying the designated `customer_name` instead of the account owner's name for third-party tickets. |
| T4 | Leaderboard Styling Consistency | ✅ | Restored the blue gradient podium backgrounds for the Top 3 ranks in both the Admin and Technician leaderboards (bypassed Tailwind v4 bugs with inline styles). Standardized tab toggle button classes (`btn-primary` and `btn-outline`). |
| T5 | Notification System Enhancements | ✅ | Notifications now display the Ticket Code (`#TIC...`) instead of raw URLs. Clicking a notification correctly targets and marks only that single notification as read. Assignment notifications feature a new distinct emoji. |
| T6 | Pickup Method Updates | ✅ | Integrated `PickupMethodSelector` allowing Admins/Technicians to change the handover method (Self-Pickup vs Courier) even after ticket creation. |

### SPRINT 2026-06-02 SESSION — Global Layout & Dashboard Updates
| # | Task | Status | Notes |
|---|------|--------|-------|
| G1 | Global Content Centering | ✅ | Modified `.dashboard-content` in `globals.css` with `display: flex; justify-content: center;` and `.dashboard-content > * { width: 100%; }` to globally center all form wrappers horizontally while allowing lists to maintain full width. |
| G2 | Dashboard Stats (Stores) | ✅ | Replaced the Customers count on the Admin Dashboard with the total count of operational Stores using `db.storeLocation.count()`. |
| G3 | Dashboard "Closed" Link | ✅ | Adjusted the Dashboard "Closed" tickets card to link directly to `/admin/tickets?status=done`. |
| G4 | Tickets Filter Unassigned | ✅ | Added "Unassigned" to the Ticket status filters in `/admin/tickets`, routing queries for unassigned tickets using `{ technician_id: null }`. |

### SPRINT 2026-06-03 SESSION — Achievement System, Caching & Ticket Assignment Requests
| # | Task | Status | Notes |
|---|------|--------|-------|
| AC1 | Cleaning + PC Gaming point correction | ✅ | `getTicketPoints()` now returns 4 points for `cleaning` ticket type with `PC_Gaming` device type, and 2 points for other cleaning tasks. |
| AC2 | Store Coordinator Dashboard | ✅ | Dashboard renders title "Store Coordinator Dashboard" and awards purple "Coordinator of the Month" badge (with `ShieldCheck` icon) to coordinators (`is_team_leader: true`), excluding them from the technician ranking leaderboard. |
| AC3 | Points Badge in My Tickets | ✅ | Added a colored badge (⭐ N pts) to both desktop table columns and mobile cards for all active/my tickets list pages. |
| AC4 | Achievement Title System | ✅ | Added `UserTitle` model & `active_title` field. Designed a game-style inventory UI in the profile page allowing users to equip/unequip their earned titles. |
| AC5 | Caching & Revalidation Gotchas | ✅ | Integrated `unstable_cache` across achievements, profiles, and leaderboards. Resolved runtime revalidation tag rendering errors by restricting `revalidateTag` calls strictly to Server Actions/API Route handlers. |
| AC6 | Ticket Request Management System | ✅ | Restricted to 1 request per ticket. Added `<RequestsBell>` for Admins/Coordinators. Implemented ticket statuses: "Requested" (amber, cancelable by requesting technician) and "Requested by other" (gray, disabled) states. |
| AC7 | Modal and Attachment File Name Wrapping | ✅ | Fixed proof dialog wrapping by changing `.modal-overlay` alignment, adding sticky headers, and wrapping filenames in `FileUpload` with `wordBreak: break-all`. |

### SPRINT 2026-06-05 SESSION — Performance & Handover Refinements
| # | Task | Status | Notes |
|---|------|--------|-------|
| P1 | Dashboard Performance | ✅ | Flattened database queries in `TechnicianDashboard` and `AdminDashboard` using `Promise.all` to eliminate waterfall waits, reducing query time significantly. |
| P2 | Action Blocking Fix | ✅ | Refactored `updateTicketStatusAction` and `adminUpdateTicketStatusAction` to execute `sendTicketStatusEmail` as a fire-and-forget promise. Status update latency dropped from 10-19s to <1s. |
| P3 | UI Skeletons & Animations | ✅ | Added missing CSS keyframes (`shimmer`, `spin`, `pulse-dot`) to `globals.css`. Built `loading.tsx` skeletons for 6 major views (leaderboards, profiles, users, logs). |
| H1 | Technician Handover Flow | ✅ | Rewrote `StatusUpdater.tsx` to provide technicians with post-Done interactive buttons (`ready_for_pickup`, `handed_to_courier`, `completed`). Handover steps adapt automatically based on the `pickupMethod`. |

### SPRINT 2026-06-10 SESSION — Post-Launch Refinements & Fixes
| # | Task | Status | Notes |
|---|------|--------|-------|
| P1 | Assignment Locks | ✅ | `AdminAssignPanel.tsx` locks Technician select when ticket is `on_progress`, but keeps Sales select open for Admins/Coordinators. Server guard in `admin.ts` updated to allow Sales reassignment. |
| P2 | Title Unequip Sync | ✅ | Added `revalidatePath("/technician/dashboard")` to `equipTitleAction` so dashboard updates immediately. |
| P3 | Coordinator Quick Accept | ✅ | `requestTicketAssignmentAction` bypasses queue and directly assigns ticket if requester is `is_team_leader`. |
| P4 | Dashboard Refresh | ✅ | Consolidated multiple `<RefreshButton />`s into a single top-header refresh button on the Technician Dashboard. |
| P5 | My Tickets Sort Priority | ✅ | Modified `tickets/page.tsx` default sort to custom JS priority: On Progress > Waiting > Ready for Pickup > Done > Completed > Cancelled. |
| P6 | Password Form Focus Bug | ✅ | Inlined `PasswordInput` in `ChangePasswordForm.tsx` to stop React remount/focus loss on keystroke. |
| P7 | PC Build Replace Button | ✅ | Removed "Replace" button functionality from the First Build step in `PcBuildHandover.tsx`. |
| P8 | Email Guard & Customer Focus | ✅ | Added `EMAIL_MILESTONES` to block non-essential emails. `admin.ts` & `technician.ts` now only email the explicitly provided `customer_email`, preventing staff email pollution. |
| P9 | Level Calculation Bug | ✅ | Changed `totalHandled` to `totalSuccess` (`success_count`) in `profile/page.tsx` so cancelled/rejected tickets don't falsely inflate technician levels. |

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
ALTER TABLE "UserTitle"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TicketAssignmentRequest" ENABLE ROW LEVEL SECURITY;

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

### SPRINT 2026-06-20 SESSION - Quality of Life & Coordinator Visibility
| # | Task | Status | Notes |
|---|------|--------|-------|
| Q1 | Optional Email | ✅ | Modified `CreateTicketForm.tsx` to allow empty emails. `updatePickupMethodAction` and db save empty strings as `null`. Resend API guards handle this gracefully. |
| Q2 | Courier Restriction | ✅ | Courier option disabled in creation form and ticket view for all non-PC Build types. Added server-side guard in `updatePickupMethodAction`. |
| Q3 | File Upload UI | ✅ | Added rich `.file-upload-area` styles with hover states, lift animations, and explicit click cues in `FileUpload.tsx`. |
| Q4 | Extra Points Panel | ✅ | Added `extra_services String[]` to `Ticket` model. Added `toggleExtraServiceAction` and `ExtraPointsPanel.tsx` giving +3 points for each extra service. |
| Q5 | Coordinator Visibility | ✅ | Coordinators now see all tickets across their assigned stores in both their dashboard ("Store Active Tickets") and "My Tickets" list. |

---

### SPRINT 2026-07-21 SESSION - SSO & Authentication Integration
| # | Task | Status | Notes |
|---|------|--------|-------|
| A1 | Authentication Actions | ✅ | Implemented server actions for authentication and session management. |
| A2 | Login Page Refactor | ✅ | Reverted login page to purely client component to fix CSS SSR bugs. Added dynamic layout for login route. |
| A3 | SSO Sync Route | ✅ | Implemented SSO authentication sync route (`/api/auth/sso-sync/route.ts`) and standardized URL resolution across proxy and auth logic. |
| A4 | Tech Performance Dashboard | ✅ | Added technician performance tracking dashboard with filterable analytics and metrics. |
| A5 | Ticket Workflows | ✅ | Implemented technician ticket assignment system and status update workflows with file attachment support. |
| A6 | Admin Management Actions | ✅ | Added technician ticket detail views, public sharing components, and administrative management actions. |

---

### SPRINT 2026-09-24 SESSION — RMA Phase 6: public page, KPI, docs
Branch `feat/rma-warranty-claim`. 343 tests, `tsc` clean, production build passes.

| # | Task | Status | Notes |
|---|------|--------|-------|
| T1 | Public page understands `rma_process` | ✅ | `STATUS_STEPS` in `app/[date]/[ticketCode]/page.tsx` turned out to be dead code — declared, never read — so the timeline was rendering `log.new_status.replace(/_/g," ")` and showing customers the line "rma process". New pure module `lib/rma/public-status.ts` holds a label per `TicketStatus`. `Badge` learned `rma_process` too; it was falling through to a class-less "rma process" in the staff portals. |
| T2 | Three claim endings look different | ✅ | `getPublicClaimOutcome()` renders a verdict banner above the ticket details. Not eligible / rejected by vendor / repaired-replaced-refund all finish `done` → `completed`, so without it they were indistinguishable. It takes only status, decision and the ineligibility reason as arguments, so no internal field can reach the page through it. 21 tests, one walking every `TicketStatus`. |
| T3 | Warranty claim credited once | ✅ | `lib/kpi.ts` holds the rule `(type != warranty_claim && done) \|\| (type == warranty_claim && rma_process)` as both a predicate and a Prisma filter. `handoverToRmaAction` now credits `TechnicianPerformance` inside the handover transaction. The `done` that `rma.ts` writes when a case closes credits nothing. |
| T4 | Admin double-count fixed | ✅ | `adminUpdateTicketStatusAction` had `completed` in `isTerminal` plus a private point table, so an admin closing any ticket credited the technician a second time. Both gone. Historical inflated rows left alone. |
| T5 | Point tables — diagnosed, split out | ⚠️ | Found nine copies of `getTicketPoints` with four different tables: a `Basic_Cleaning` ticket shows 2 pts, credits 5 when a technician closes it and 4 when an admin does. Divergent since `0fed3b9` (2026-07-27). **Not unified here** — doing so shifts displayed figures and admin-credited points, which is outside this branch's "no effect on other ticket types" rule. `lib/points.ts` was added but is used only by `tickets.ts` / `technician.ts` / `rma.ts`, which already used exactly that table, so no figure moves. Unification parked on `fix/points-table-unification`. |
| T6 | ~~Ineligible claim costs nothing~~ | ♻️ | **Superseded twice.** First changed to "paid the same as a handover" (2026-09-25), then made moot entirely when the ineligibility decision moved to the RMA desk (2026-09-26). Current rule: one paid exit, the handover. See the 2026-09-26 sprint. |
| T7 | Monthly winners read the log | ✅ | `getTopTechnicianOfMonth` / `getTopStoreOfMonth` / the admin performance report queried `ticket.status == "done"`, so a ticket dropped out of its month the moment the customer picked it up. All three are log-based now, on the same filter as the leaderboard. |
| T8 | `FLOW.md` | ✅ | New § 5 "Warranty Claim & RMA Flow" with the two legal exits and, explicitly, that **every claim statistic must filter on `claim_eligible` and `decision`** — otherwise a vendor rejection counts as a successful claim. § 4 point table corrected (it held a fifth, wrong copy). |
| T9 | QC plan | ✅ | Nothing is SKIP any more. D-05 and G-01–G-03 reopened, G-04–G-06 and H-05b–H-05d added, and the changed point figures flagged so a tester does not report them as bugs. |

### SPRINT 2026-09-25 SESSION — RMA dashboard, metrics, local tooling
Branch `feat/rma-warranty-claim`. 442 tests at close.

| # | Task | Status | Notes |
|---|------|--------|-------|
| D1 | Dashboard rebuilt around what needs acting on | ✅ | Was a long vertical list of every open case, sitting under the stats and the activity log. Now a "Perlu Perhatian" band, one card per stage showing the longest-waiting cases with urgency pills, and a green card listing the stages that are clear. Overflow folds into `<details>` rather than linking to a `/rma/cases` route that does not exist. |
| D2 | Per-stage deadlines | ✅ | `RMA_STAGE_SLA` in `lib/rma/queue.ts`: a warning and an overdue threshold per stage, measured from when the case **entered** that stage (newest `RmaEvent`), not from when it opened. Desk-controlled stages are tight; vendor stages keep 7/14. Tune the table and every count, colour and sort order follows. |
| D3 | Activity feed moved to `/rma/logs` | ✅ | Its own page with search, status filter, date filter, 25 per page, filters preserved across paging. `queue.ts` no longer runs the 15-event query at all. Sidebar entry added. |
| D4 | Two contradicting figures reconciled | ✅ | "Lewat 14 Hari" counted vendor days only while the band counted every stage past its target — 2 against 1 on the same screen. Fixing that exposed the vendor figure itself being wrong ("Di Vendor 1 (2 lewat 14 hari)"), because `submitted_at` survives a case leaving the vendor stages. Six invariants now pinned in `queue.test.ts`, including `overdue <= atVendor`. |
| D5 | Four more figures | ✅ | Tanpa PIC, rata-rata penyelesaian with a month-on-month comparison, hasil klaim (share of decided claims not rejected), and case-per-vendor. Plus monthly intake beside closures, so the card says whether the pile is growing. |
| D6 | Vendor names stop splitting | ✅ | `vendor_name` is free text and held "Asus Service Center" and "ASUS SERVICE CENTER" as two vendors. `lib/rma/vendor.ts` folds a new name onto one already in use when they differ only by case or spacing; a genuinely new vendor keeps its own capitalisation, since Title Case would turn "iBox" into "Ibox". Applied on save, with a datalist in the case form. Old rows are not rewritten; the dashboard groups on the folded key. |
| D7 | Claims by brand and by device type | ✅ | `device_name` splits the same way: "ASUS ROG G15", "ASUS ROG" and "Asus TUF A15" are three strings for one manufacturer. Grouped by brand (first word), labelled with the most common spelling. Counts every claim ever raised, not just open ones. |
| D8 | Ticket-code collision | ✅ | `createTicketAction` read the most recently **created** ticket and added one. A backdated row left a low number on the newest ticket, so a store holding NGW-000001..9 asked for NGW-000004 forever and died on P2002. Now reads the highest code, plus a retry. Pre-existing since `00fefe6`. Branch `fix/ticket-code-collision` off main, cherry-picked here with 9 tests. |
| D9 | Create Ticket button dead for claims | ✅ | `disabled={isPending \|\| ticketType === "warranty_claim"}` — the other half of the "Coming Soon" placeholder, left behind when the intake was built. Third time this feature broke in the same shape, so `create-form.test.ts` now reads the source and pins all three. |
| D10 | MinIO replaces R2 locally | ✅ | `STORAGE_DRIVER=local` skips the S3 client entirely, so nothing in the R2 path was ever exercised before deploy. `R2_ENDPOINT` now points the real client at MinIO. Production untouched: unset behaves as before, `forcePathStyle` follows the endpoint, and a non-https endpoint is refused under `NODE_ENV=production`. ⚠️ Docker Hub refuses `minio/minio` on this machine — use `quay.io/minio/minio`. See `docs/minio-local-storage.md`. |
| D11 | Seed pointed at production | ✅ | The deploy runbook ended with `npm run seed` against Supabase. It writes six accounts with published passwords, and its `upsert` sets the password in the `update` branch too — so it would reset a live `admin@techserve.id` to `admin123` and re-enable it. Replaced with `npm run create-user`. `NODE_TLS_REJECT_UNAUTHORIZED=0` removed: process-wide, and pointless for Postgres because the driver already skips verification. |

---

### SPRINT 2026-09-26 SESSION — eligibility moves to the RMA desk
Branch `feat/rma-warranty-claim`. **477 tests**, `tsc` clean, production build passes.

Plan approved before any code was written: `docs/plan-rma-eligibility.md`.

| # | Task | Status | Notes |
|---|------|--------|-------|
| E1 | Technician stops deciding eligibility | ✅ | They examine, document, and hand over; the desk judges. `updateTicketStatusAction` refuses `done` on a claim outright instead of asking for a reason. |
| E2 | `ineligible` status | ✅ | New terminal `RmaStatus`, reachable from `pending_verification`, `on_hold` and `verified`, reason required. Deliberately **not** `RmaDecision.rejected` (the vendor turned it down after receiving the unit) and not `cancelled` (abandoned rather than judged) — `FLOW.md` § 5 requires reports to tell these apart. Releases the ticket to `done` like the other terminal states. |
| E3 | Admin guard repurposed | ✅ | `d983b53` / `9838ebd` asked an administrator for a reason; the move is now refused outright, so there is no quieter second way to make the same call. |
| E4 | Evidence is mandatory | ✅ | Handover requires 1–5 photos, images only, stored as `TicketAttachment` so the case page previews them. The desk's own refusal carries the same burden. Until now the desk judged on three lines of typed text. |
| E5 | Technician recommendation | ✅ | Eligible or not, plus a note, on `RmaCase`. Advisory by construction: nothing reads it to gate a transition or preselect anything, and it never reaches the public page. The note is optional for "eligible" and required for "not eligible". Nullable in the database — seven cases predate it — and required at handover in the application, as `device_sn` is. |
| E6 | KPI simplified | ✅ | Back to one paid exit. The third branch of `EARNING_STATUS_LOG_FILTER` and the `claimEligible` argument to `performanceEffect` are removed rather than left dead. |
| E7 | `rmaStatusMeta` exhaustive | ✅ | Lost its string fallback, which would have rendered "ineligible" as raw enum text — exactly how `rma_process` once leaked onto the public page. A new status now fails the build instead. |
| E8 | UI caught up | ✅ | Photo uploader, recommendation buttons and note in the handover dialog, with client validation repeating the server's exact sentences. "Tidak layak klaim" removed from both portals. The admin panel explains itself rather than rendering an empty row. |
| E9 | Recommendation and pre-handover queue shown | ✅ | Recommendation on the case page and as a badge in queue rows; a read-only "Menunggu Pemeriksaan Teknisi" list on the dashboard for claims whose unit is still with the technician. |
| E10 | RMA can see the attachments | ✅ | The case page rendered only the invoice, so everything else on the ticket was invisible to the person deciding whether to involve a vendor. |

---

### SPRINT 2026-09-28 → 10-01 — MariaDB port, data migration, cutover, RMA refinements
18 commits, `52feee5` → `ca44816`, all on `main` and `deploy`. **557 tests**, `tsc` clean,
production build passes. ✅ **Cutover done 2026-10-01** — production runs MariaDB.

| # | Task | Status | Notes |
|---|------|--------|-------|
| M1 | Schema + adapter to MariaDB | ✅ | `provider = "mysql"`, `extra_services String[]` → `Json` (scalar lists are PostgreSQL-only and fail `prisma validate`, not runtime). `@prisma/adapter-pg` → `@prisma/adapter-mariadb` 7.10.0 |
| M2 | `lib/mariadb.ts` — one copy of the connection | ✅ | Seven entry points open a client; copied settings are how this project got four disagreeing point tables. `lib/mariadb.test.ts` reads the source and fails if any of them drifts |
| M3 | **27 columns given `@db.Text` / `@db.LongText`** | ✅ | The mysql provider maps `String` → `VARCHAR(191)` where PostgreSQL used unlimited `TEXT`. The first DDL had **118 VARCHAR(191) and zero TEXT** — every chat message, status reason and `Ticket.notes` (Tiptap HTML) would have silently capped at 191 characters |
| M4 | **`STRICT_TRANS_TABLES` forced per connection** | ✅ | The server runs without it. Proven side by side: strict raises "Data too long for column", loose stores the truncated value. PostgreSQL rejected both; this restores the guarantee |
| M5 | **`useTextProtocol: true`** | ✅ | Without it **every search box** fails on the server: `LIKE CONCAT('%', ?, '%')` mixes collations because the two servers disagree about a bound parameter's collation under the binary protocol. **Cannot be reproduced locally** — found only by running the real client against the real server |
| M6 | 15 `mode: "insensitive"` removed | ✅ | Deleted, not replaced: the collation is `utf8mb4_unicode_ci`, already case-insensitive. Only 6 of the 15 were caught by `tsc`; the rest sat in untyped `where` objects |
| M7 | Advisory lock → retry budget | ✅ | `pg_advisory_xact_lock` is transaction-scoped and has no MariaDB equivalent. `MAX_ALLOCATION_ATTEMPTS = 10`; exhausting it returns "try again", never a duplicate. BL19 |
| M8 | Realtime → 30s polling | ✅ | `lib/supabase.ts` deleted entirely, `@supabase/supabase-js` removed. Three `*SUPABASE*` env vars are no longer read by anything |
| M9 | `output: "standalone"` + `postbuild` | ✅ | Hostinger builds standalone. Next does **not** copy `.next/static` or `public/`, and without them every page answers 200 while all CSS and JS 404. `scripts/copy-standalone-assets.mjs` runs as `postbuild` so it cannot be skipped. `build` is `next build --webpack`: Turbopack dies on this host spawning PostCSS, and the panel ignores its own build-command field |
| M10 | `scripts/migrate-from-supabase.ts` | ✅ | All 23 tables, **7,139 rows**, idempotent, Supabase read-only. Rehearsed twice — local container and Hostinger — with bcrypt hashes, `extra_services`, enums, relations and technician points all verified intact |
| M11 | RMA: stock transfer number | ✅ | A store-stock unit cannot be verified without the Accurate transfer document number. Also closes `on_hold → in_vendor_process`, which reaches the vendor without passing `verified` |
| M12 | RMA: vendor form follows ownership | ✅ | `vendor_rma_number` → "Nomor Klaim Pemasok", required for store stock only. A customer's unit gets an optional `customer_ticket_number` and an optional receipt photo instead of a tracking number |
| M13 | RMA ticket list + create redirect | ✅ | `/rma/tickets` did not exist, and `createTicketAction` sent RMA to `/ticket/${share_token}` — a route that has never existed. Now `ticketsListHrefForRoleName` in `lib/routes.ts`, exhaustive over `Portal` |

| M14 | RMA ticket list laid out like My Tickets | ✅ | Points pill (from `lib/points.ts`, so its figures differ from the technician list until BL3 — see the comment in the page), sortable Updated column, Manage button |
| M15 | RMA list shows only claims it has a stake in | ✅ | `warranty_claim` **and** (has an `RmaCase` **or** still `waiting`/`on_progress`). Three claims a technician resolved months ago without RMA are hidden. Combined with `AND` because the search also uses `OR`, and two `OR` keys overwrite each other |
| M16 | Vendor form follows unit ownership | ✅ | `vendor_rma_number` → "Nomor Klaim Pemasok", required for store stock only. A customer's unit gets an optional `customer_ticket_number` and an optional receipt photo instead of a tracking number |
| M17 | **BL21 — the customer tracking page** | ✅ | Two faults. `proxy.ts` tested `startsWith("/ticket")`, a route that never existed, so **every WhatsApp link the shop sent landed on /login**. And opening it as-is would have been worse: codes run NGW-000001..000372 with no gaps and `date` was never in the lookup, so the whole list was walkable. Now resolves by `public_share_token`; folder renamed `[ticketCode]` → `[shareToken]`; six hand-built URLs replaced by `publicTicketPath()`; both dead `PublicShareButton` components deleted |

#### Cutover, 2026-10-01 — what actually happened

| Step | Result |
|---|---|
| Fresh `pg_dump` of Supabase | `Documents/Project/pre-cutover-2026-10-01-1032.dump`, 584.6 KB, 23 app tables verified |
| Two new RMA columns pushed to Hostinger | `stock_transfer_number`, `customer_ticket_number` |
| **3 tickets + 1 user found only on Hostinger** | NGW-000366/367/368 and `rmahnsitcenter@gmail.com`, created 29–30 Sep. Confirmed as test data and dropped. They continued production's numbering rather than colliding with it, which is why this had to be asked before the copy |
| Data copied | **7,139 of 7,139 rows**, 23 tables, every column mapped |
| Verified on the server | 16 users / 512 tickets matching Supabase exactly, bcrypt hashes intact, search returning 365 for both `ngw` and `NGW`, leaderboard 486 earning logs, Rianto 483 / Mitchel 481 |
| Build on Hostinger | Succeeded. Verified live: `/admin/dashboard`, `/admin/tickets`, `/admin/tickets?q=ngw`, `/rma/tickets`, `/rma/dashboard`, `/admin/leaderboard` all 200 with CSS |

**Production had taken no tickets since 28 September**, so nothing was lost in the window.
Supabase was only ever read and still holds a complete copy — do not delete the project yet.

**Still unverified by a human, and the obvious QC starting point:** login with a real staff
password (every check above used a forged session), **photo upload — the only thing that
exercises R2**, creating a ticket, and the full claim handover. The RMA account
`rmahnsitcenter@gmail.com` was dropped with the test data and needs recreating through the
tunnel before the desk can be used.

---

## 📋 BACKLOG — what is likely to come next

Ordered roughly by how much is already decided.

### Approved, waiting only on QC finishing

| # | Item | Where |
|---|------|-------|
| BL1 | **Field "komponen yang diklaim"** — which part is being claimed. Approved, scoped to every device type, because all nine claims on record are laptops and a PC-only field would report nothing. Schema, intake form, and QC A-02..A-08 | `docs/issue-claimed-component.md` |
| BL2 | **Rewrite QC sections C, D and F** for the new claim flow. D is entirely about the removed technician path; C-01/C-06 and F-02/F-16 change | `docs/rma-test-checklist.md` |

### Parked branches — written and tested, not pushed

| # | Branch | Note |
|---|--------|------|
| BL3 | `fix/points-table-unification` | Nine copies of `getTicketPoints` into one. **Shifts displayed figures** (cleaning 2/4 to 3/5, service `Other_Device` 5 to 3) and admin-credited points. `docs/points-change-announcement.md` explains it per case for the technicians. ⚠️ Behind the RMA branch — needs rebasing |
| BL4 | `fix/ticket-code-collision` | The P2002 fix, cut from main so it can land on its own |
| BL5 | `fix/claude-md-seed-warning` | One file: stops the setup guide pointing `npm run seed` at a shared database |

### Known defects, deliberately not fixed yet

| # | Item | Where |
|---|------|-------|
| BL6 | ⛔ **`delivery.ts:50` swallows the action's return value** and reports success regardless. Dormant only because no panel currently offers a handover button for a status the action refuses — the first new caller activates it, and the symptom misleads. **Fix before adding any new caller of `adminUpdateTicketStatusAction`** | `docs/issue-transition-guard.md` |
| BL7 | **No ticket transition guard.** Any status may follow any status, so `done` to `on_progress` to `done` credits a technician twice. The note includes SQL to check whether it has actually happened | `docs/issue-transition-guard.md` |
| BL8 | **Sales redirect 404s** — `ticketHrefForPortal("sales")` points at `/customer/...`. Wants its own branch off `origin/main` | `lib/routes.ts` |
| BL9 | **Average-duration report** misses claims sitting at `rma_process`. It measures elapsed work time rather than credit, so it was left alone | `app/admin/performance/page.tsx` |
| BL10 | Residual: both claim guards key on `waiting`/`on_progress`. A real transition table closes this without special-casing claims | `docs/issue-transition-guard.md` |

### Deployment and infrastructure

| # | Item |
|---|------|
| BL11 | ⚠️ **Superseded.** The branch is pushed and the database is MariaDB, not Supabase, so the enum warning no longer applies. What remains is the **cutover**: `docs/cutover-runbook.md`. Original note: it will crash against Supabase until `RmaCase`, `RmaEvent` and the new enum values exist there — several pages already `select: { rma_case: ... }`. Steps in `docs/rma-deploy.md`. Postgres enum values **cannot be removed**, so `ineligible` is permanent once applied |
| BL12 | **RLS not enabled** on any table, now including `RmaCase` and `RmaEvent` |
| BL13 | **Demo data** NGW-000004..NGW-000009 still in the local database |
| BL14 | Production TLS: `rejectUnauthorized: false` in `lib/db.ts` is interim; the target is Supabase's CA bundle |
| ~~BL15~~ | ✅ **DONE** — see sprint 2026-09-28. Original note kept for its reasoning: inventoried 2026-09-27 in `docs/plan-mariadb-port.md`. Bigger than the one-line note suggested: `extra_services String[]` is a scalar list, which Prisma supports on PostgreSQL only, so it fails `prisma validate` and forces a schema change plus data migration. Supabase Realtime dies entirely. 15 `mode: "insensitive"` usages must be dropped (MySQL collation is already case-insensitive). Plus the advisory lock, PascalCase table names, and 477 tests that currently run on Postgres |

### Worth doing, nobody has asked yet

| # | Item |
|---|------|
| BL16 | **jsdom and React Testing Library.** `create-form.test.ts` reads the file as text because the project cannot render a component in a test. That guard exists because the claim flow broke three times by confirming a form renders instead of confirming the flow completes |
| BL17 | **A real vendor table.** The folding in `lib/rma/vendor.ts` stops the splitting getting worse; it does not clean up what is already there, and vendors still cannot be managed from the UI |
| BL18 | `extra_services` earns nothing anywhere. Two badges used to imply otherwise. Whether extras should earn is one line in `lib/points.ts` — and an unanswered question |
| BL19 | **RMA code allocation is retry-based, not serialised.** `pg_advisory_xact_lock` was transaction-scoped and had no MariaDB equivalent — `GET_LOCK()` is connection-scoped, so it cannot be held to commit without leaking on an error path. `allocateRmaCode` now absorbs contention through `MAX_ALLOCATION_ATTEMPTS = 10`: with N simultaneous handovers at one store the Nth needs its Nth attempt, and exhausting the budget returns "please try again" rather than a duplicate, because the unique index is the real guarantee. The deterministic fix is a per-prefix counter row whose InnoDB lock is held to commit and rolls back cleanly — a schema change, deliberately kept out of the port |
| ~~BL21~~ | ✅ **DONE 2026-10-01** (`ca44816`), and the fix went further than the note: resolving by ticket code was also enumerable. Original note: ⛔ **The public share page is unreachable by the people it is for** — two independent faults, both pre-existing, found while testing the standalone build. (a) `proxy.ts` allows `/ticket*` but the page lives at `/[date]/[ticketCode]`, so `/2026-09-28/NGW-000001` redirects an anonymous visitor to `/login` (verified: 307 → /login). (b) `PublicShareButton` copies `/ticket/${shareToken}`, which passes the proxy but resolves against `findUnique({ ticket_code })` — a share token is not a ticket code, so the copied link finds nothing. `PUBLIC_ROUTES` in `proxy.ts` is declared and never read, the same dead-constant shape as `STATUS_STEPS`. Also worth noting: `date` is not used in the lookup, so it adds no secrecy. This makes the whole public-status work from the 2026-09-24 sprint invisible in production. **Own branch off `origin/main`** — unrelated to the MariaDB port |
| BL20 | **`extra_services` should be a catalog table, not a Json column.** The six services and their points are hardcoded in `ExtraPointsPanel.tsx`, which is why a third point table exists (2/3/1/1/3/2 there, +3 flat on the list badges, 0 in `lib/points.ts`). `Upgrade` + `TicketUpgradeDetail` already model exactly this correctly. End state: `ExtraService` + `TicketExtraServiceDetail` with `@@unique([ticket_id, extra_service_id])`. Held back from the MariaDB port on purpose: a platform move and a redesign in one change make a failing test impossible to attribute. Related: `TicketUpgradeDetail` has **no** `@@unique`, so the same upgrade can be attached twice and counted twice |

---

### HOW TO RESUME IN A NEW SESSION

1. Read this file (`CLAUDE.md`) — it is the source of truth
2. Check the sprint tables above — find any ⬜ or 🔄 items
3. Before coding, **read the actual source file** to verify it matches the Notes column (they can drift)
4. Mark items 🔄 when starting, ✅ when done
5. Always run `npx tsc --noEmit` before committing — TypeScript must compile clean
6. Commit after each logical group

**Key constraint reminders:**
- **TypeScript & ESLint:** This project strictly uses **TypeScript**. You must always run `npx tsc --noEmit` and `npm run lint` before committing to ensure there are no typing or formatting errors that would break the build.
- **Routing guard:** `proxy.ts` (not `middleware.ts`), exported function named `proxy` (not `middleware`)
- **Prisma 7 + MariaDB:** Never use `datasources`. Build every client with `@prisma/adapter-mariadb` and the shared `mariadbPoolConfig()` + `MARIADB_ADAPTER_OPTIONS` from `lib/mariadb.ts`. Do not reintroduce `@prisma/adapter-pg`, and do not hand-roll connection settings — `lib/mariadb.test.ts` fails the build if any entry point does
- **Tiptap:** Always pass `immediatelyRender: false` to `useEditor()`
- **CSS imports:** `@import "tailwindcss"` is line 1 of `globals.css`. Never add Google Fonts `@import` to CSS — put font `<link>` tags in `app/layout.tsx`
- **Tailwind v4:** Uses `@import "tailwindcss"` directive — NOT the old `@tailwind base/components/utilities`
- **Styling convention:** Existing components use vanilla CSS classes (`.card`, `.btn`, `.form-input`). New pages/components may use Tailwind utility classes
- **Logo:** Always use plain `<img src="/logo-hns.jpg">` — NOT Next.js `<Image>` component (causes hydration issues in sidebar/auth pages)
- **`session.ts`** has `import "server-only"` — never import it from client components
- **Stat cards:** Use `.stat-card > .stat-card-icon + .stat-card-body > (.stat-card-value + .stat-card-label)` — vertical column layout
- **Leaderboard data:** Comes from `TicketStatusLog`, NOT from the `Leaderboard` snapshot table (which is legacy). Filter with `EARNING_STATUS_LOG_FILTER` from `lib/kpi.ts`, never with a bare `new_status: "done"` — that credits a warranty claim twice
- **Point system:** `lib/points.ts` is what gets CREDITED; the leaderboard, the badges and `admin.ts` still carry three other tables that disagree (see `FLOW.md` § 4, branch `fix/points-table-unification`). Import from `lib/points.ts` for anything new — do not add a fifth. Not stored on `Ticket`
- **KPI rule:** One copy, `lib/kpi.ts`. `performanceEffect(type, status)` decides success / failure / ignore for `TechnicianPerformance`; `EARNING_STATUS_LOG_FILTER` is the same rule as a Prisma filter
- **Role → route:** One copy, `lib/routes.ts`. Exhaustive `switch` over `Role` with `const _exhaustive: never`, so a new role without a destination fails `tsc` instead of silently falling through to `/login` — which is what the redirect loop was. Used by `proxy.ts`, `app/actions/auth.ts`, `app/page.tsx`, `NotificationBell.tsx`
- **Public page secrecy:** `/{date}/{ticketCode}` must never render `vendor_rma_number`, `hold_reason`, `decision_notes`, `stock_origin`, `stock_transfer_number`, `customer_ticket_number` or `RmaEvent.note`. It selects RMA fields one by one; keep it that way
- **Local uploads:** two options, neither needing R2 credentials. `R2_ENDPOINT=http://127.0.0.1:9000` points the real S3 client at local MinIO and exercises the same code path as production — preferred; see `docs/minio-local-storage.md`. `STORAGE_DRIVER=local` writes to `public/uploads` instead, which is simpler but skips the S3 code entirely, so nothing in that path is tested. Without either, every upload fails with a TLS error locally
- **Phone numbers:** Always stored as `+62XXXXXXXXX` format. The `+62` prefix widget is used in `CreateTicketForm` and `register/page.tsx`
- **Notification bell:** Uses `position: fixed` (not `absolute`) to prevent mobile overflow
- **Component Spacing & Padding:** Always provide appropriate gaps and paddings depending on the components. If elements belong tightly together, use a small gap (e.g., `gap-2`). If separating distinct sections or larger components, use a wider gap (e.g., `gap-4` or `gap-6`). **ALWAYS remember to add padding** inside components (e.g. `p-4`, `p-5`, or `px-6 py-4`) based on the component's visual needs. Never leave components without adequate internal padding.

