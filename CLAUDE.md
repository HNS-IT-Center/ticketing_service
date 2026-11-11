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
| SY1 | ~~Session cookie → session-only (destroy on browser close)~~ | ♻️ | **Superseded 2026-10-27 (CA10)**: the cookie now always has a lifetime. Original: Done — `lib/session.ts` `createSession` has no `expires`, JWT still has 7d expiry as guard |
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
| M9 | `output: "standalone"` + `postbuild` | ✅ | Hostinger builds standalone. Next does **not** copy `.next/static` or `public/`, and without them every page answers 200 while all CSS and JS 404. `scripts/copy-standalone-assets.mjs` runs as `postbuild` so it cannot be skipped. `build` is `next build --webpack`: Turbopack dies on this host spawning PostCSS, and the panel ignores its own build-command field. **2026-10-02: the same host quirk hits `next dev` too** — `/technician/tickets/[id]` answered 500 for every ticket with nothing in the log but `write EPIPE` and "Jest worker encountered 2 child process exceptions", while every other route stayed 200. Clearing `.next` and running `next dev --webpack` fixed it. `dev` is now webpack, `dev:turbopack` keeps the old behaviour |
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

### SPRINT 2026-10-01 → 10-02 — QC run A–J, four fixes, list changes
Branch `fix/qc-findings`, cut from `fix/public-ticket-page` (not from `main`, which is far
behind and has neither the MariaDB port nor the RMA work). **583 tests**, `tsc` clean.

QC of modules A–J was run as far as it goes without a browser: API routes, pure modules,
database invariants and the rendered public page. ~27 scenarios verified, 11 findings, 10
blockers. Results per row are in `docs/QC Flow — HNS IT Center Ticketing Service + RMA.md`;
what is stale in the plan that produced it is in `docs/qc-run-2026-10-01.md`.

| # | Task | Status | Notes |
|---|------|--------|-------|
| Q1 | **Cross-store approval** | ✅ | `GET /api/ticket-requests` filtered by store, `POST` checked nothing — a coordinator could approve any store's ticket if they knew the `requestId`. The bell hid those rows; nothing refused them. Rule moved to `lib/assignment-authority.ts`, read by both halves. Verified: `raffi` (NGW) → 403 on an NGH ticket, `dennis` (NGH) and admin still pass |
| Q2 | **Two pending requests on one ticket** | ✅ | `findFirst` then `upsert`, no transaction; `@@unique([ticket_id, technician_id])` does not stop two *different* technicians. Reproduced. MariaDB has no partial unique index, so the fix is `SELECT ... FOR UPDATE` on the ticket row around the check and the insert |
| Q3 | **401s that lied** | ✅ | `upload-temp` used `requireSession()`, whose redirect surfaced as `500 {"error":"NEXT_REDIRECT"}`; `notifications` answered `401 []`, which reads as "no notifications" to anything not checking the status |
| Q4 | **Warranty-claim chip + RMA stage in the lists** | ✅ | A claim leaves the portals (`rma_process`) and comes back (`done`), so a status chip could never find them all — the new chip filters on `ticket_type`. And `rma_process` covers nine RMA statuses, so the lists now show the case's own stage while the ticket is parked there. `lib/ticket-list-filter.ts` + `lib/rma/ticket-status-badge.ts`, shared by the admin, technician and RMA lists |
| Q5 | **Damage evidence accepts video** | ✅ | Was images-only by an explicit decision. Reversed because a live case was held with "VIDEO KERUSAKAN BELUM DIKIRIMKAN" — the desk wanted a video the technician could not attach. Ceiling is `serverActions.bodySizeLimit`, 20 MB per submission. `FileType` and `FilePreview` already handled video |
| Q6 | **Verification, not assertion** | ✅ | Every fix was re-tested against the running server with signed sessions, and the local database was restored afterwards (23 users · 521 tickets · 0 pending requests, unchanged) |

⚠️ **Not done, and why it matters:** QC modules C, E, F and G scored **zero** — every one of
their scenarios goes through a form submission, and the project has no browser driver (BL16).
Four things have still never been exercised by a human since the cutover, the first being
login with a real staff password. The rest is in `docs/qc-run-2026-10-01.md` § 3.

---

### SPRINT 2026-10-02 — hold reasons, a production outage, and a migration history
Branch `feat/rma-hold-reason`, **6 commits above `main`**, pushed. **638 tests**, `tsc` clean,
lint clean on everything touched. `main` = `deploy` = `cf44ca4`, which is what production runs.

| # | Task | Status | Notes |
|---|------|--------|-------|
| H1 | **A hold names what is missing, and asks for it** | ✅ | Holding a case was free text on a page only the desk opens, so the desk chased the technician by hand — one live case sat held with "VIDEO KERUSAKAN BELUM DIKIRIMKAN" in capitals. The reason is now a category (`RmaCase.hold_reason_code`), and the three `missing_*` values grow a panel on the technician's own ticket page asking for that exact thing. `other` tells an administrator instead. `lib/rma/hold-reason.ts` is the only switch, exhaustive over the enum. Sending evidence does **not** release the hold — that stays the desk's judgement |
| H2 | **Video stopped hanging on upload** | ✅ | `compressVideo` transcodes with MediaRecorder over `captureStream()`, which records the clip *while it plays* — a cost of one full playback, whatever the file size, and `recorder.stop()` was only reachable from `onended`. A stalled clip or a backgrounded tab never settled the promise. Now: under 8 MB is left alone, anything else is abandoned after 45 s, and a result that is not smaller is discarded. **Pre-existing** — `FileUpload`'s default `accept` has always included `video/*` |
| H3 | **Dev server moved to webpack** | ✅ | `/technician/tickets/[id]` answered 500 for every ticket with nothing logged but `write EPIPE` and "Jest worker encountered 2 child process exceptions", while every other route stayed 200. Same quirk M9 already recorded for the build: Turbopack dies on this host spawning PostCSS. `dev` is now `next dev --webpack`; `dev:turbopack` keeps the old command |
| H4 | **Raw database errors stopped reaching staff** | ✅ | Both RMA actions returned `err.message` straight through, so a technician saw ``Invalid `prisma.rmaCase.updateMany()` invocation: The column `hold_reason_code` does not exist``. Detail goes to the server log; the screen gets a sentence someone can act on |
| H5 | **A migration history, at last** | ✅ | See the incident below. `00000000000000_baseline` is the schema **as it actually stood**, generated from the database rather than from `schema.prisma` — faults inherited from `db push` are corrected in migrations that can be read, not hidden inside a baseline. `migrate diff` between database and schema is now empty for the first time. ⚠️ **Production is not baselined yet** — `docs/migration-baseline.md` |
| H6 | **`UserTitle.emoji` default dropped** | ✅ | Schema said `@default("🏆")`, the column said `'?'`, and they had disagreed since creation. Not a configuration mistake and no charset fixes it: MariaDB stores a column DEFAULT using `character_set_system` = `utf8mb3`, and U+1F3C6 is outside the BMP. Proven — `ALTER ... DEFAULT _utf8mb4 0xF09F8F86` from a fully utf8mb4 client still yields `'?'`. Nothing depended on it; both callers in `lib/performance.ts` pass `emoji` explicitly |
| H7 | **A whole claim walked end to end, twice** | ✅ | Handover → held for a missing video → technician answers from the panel → verified → vendor → replaced → unit received → closed; and the other legal ending, the desk finding it ineligible. Pins what no single-step test sees: paid **once** at handover (read before and after, not assumed), ticket released exactly when the case ends, `hold_reason_code` cleared on the way out, evidence stored as a video attachment |
| H8 | **Working-time widget broke hydration** | ✅ | A running timer rendered "6h 55m 2s" on the server and "6h 55m 36s" in the browser, so React discarded the tree. `useState(() => calcWorkingMs(timeLogs, Date.now()))` — a lazy initialiser runs once on the server while the page renders and again in the browser while it hydrates, separated by however long the response took. The clock is the server's now, passed as a prop, so the first client render is identical **by construction**; the live clock takes over from the interval a second later. Hit all three portals — admin, sales and technician share the component. Arithmetic moved to `lib/working-time.ts` with the clock as an argument, the rule `RmaStatusCard` already states. 20 tests, including QC **E-05** (10 worked + 5 paused + 10 worked = 20 min, not 25), which module E could never run |

#### Production outage, 2026-10-02 — what happened and why

`cf44ca4` was pushed to `main` and deployed while the production database did not have
`RmaCase.hold_reason_code`. Every technician ticket page answered 500 and every RMA transition
failed. Admin, Sales and the ticket lists were unaffected — they do not select the column.

Fixed by applying one `ALTER TABLE` through the tunnel; no rebuild was needed, because the
deployed Prisma client already knew the field and only the column was missing.

**The deploy order was wrong, but that is the symptom.** The cause is that there was no
mechanism: `prisma db push` records nothing, so every schema change had to be typed into
production by whoever remembered. That is what H5 exists to end. Until production is
baselined too, the same failure is one schema change away.

⚠️ Two things remain unproven by a human: **a technician actually clicking the upload button**
(the server side is covered from both directions — 638 tests through the real actions, and the
panel confirmed in the rendered HTML — but nobody has used it on screen), and **login with a
real staff password**, still untested since the cutover.

#### ⛔ Production outage, 2026-10-05 — and the fact that caused it

**hPanel auto-deploys from `main`.** That was not known, and it is the single most
important operational fact in this file. A push to `main` is a deploy. There is no
`.github/workflows`, no Procfile and no Vercel config in the repo, so nothing in version
control says so — the trigger lives in the Hostinger panel.

What happened: thirteen commits were pushed to `main` while the production database did not
yet have `TicketReplacedPart`. hPanel deployed them, and both ticket detail pages —
`/admin/tickets/[id]` and `/technician/tickets/[id]` — answered 500, because each now selects
`replaced_parts`. Everything else stayed up: the lists, the dashboards, login, RMA and the
leaderboard never touch that table.

The risk had been stated three times before the push and the push was made anyway, on the
owner's instruction. The lesson is not "be more careful" — it is that `deploy` existed as a
separate branch precisely so this could not happen, and `main` turned out to be wired to
production as well.

Fixed by baselining production and running `prisma migrate deploy` (BL26). No rebuild was
needed: the deployed Prisma client already knew the models, only the tables were missing —
exactly as on 2026-10-02.

**The rule, now that production is baselined:**

1. `prisma migrate deploy` against production **first**
2. only then push to `main`

#### Where it stands, 2026-10-03

| | |
|---|---|
| `origin/feat/rma-hold-reason` | `2d0ea2d` — 7 commits, all pushed |
| `origin/main` · `origin/deploy` | `cf44ca4` — unchanged, and what production runs |
| Local database | on the migration history; production is **not** (BL26) |
| Dev server | `npm run dev` now means webpack. Run it from a real terminal — a background one is capped at 2 hours |

**Two decisions are waiting on the owner, and no code should move until they answer:**

1. **BL27**, the cancelled tickets whose working time never stops. Two fixes, both change
   figures people have already seen; the recommendation is in the entry.
2. Whether `main` should be moved to `6b6fba2`. It was deliberately left alone — the last
   push to `main` was asked for explicitly, this one was not.

### SPRINT 2026-10-08 → 10-16 — store-stock intake, backend QC, the Android upload crash
Branch `feat/rma-hold-reason`. **749 tests**, `tsc` clean. `main` = `dcb0514` (K3/K4 live); K1, K5 and docs wait on a push.

| # | Task | Status | Notes |
|---|------|--------|-------|
| K1 | **Unit ownership asked at intake** | ✅ `668d054` | Store-stock claims had to be opened with an invented customer name because ownership was first asked at RMA handover. Now the first question of the form; "Stok Toko" hides the customer fields. `TicketWarrantyDetail.unit_ownership` / `stock_origin`, `purchase_date` nullable — migration `20261008061124_warranty_intake_ownership`. ✅ **Migration applied to production 2026-10-16**, so the code can ship whenever `main` moves |
| K2 | **Backend QC, 21 findings** | ✅ report | `docs/qc-run-2026-10-14.md`. 14 reproduced through the real actions against the local DB. Root cause of most: no central ticket transition table (BL7). Fix batches proposed there, **none applied yet** — see BL35 |
| K3 | **Android Chrome upload crash** | ✅ `dcb0514` | Three stacked faults: the client video transcode (Chrome-only path, made heavy by `fa4132b`) ran phones out of memory; the real body ceiling is **10 MB** (`proxyClientMaxBodySize`, because `proxy.ts` runs on every route), not 20; and four upload forms had no catch while the app had no error boundary. Transcode removed, 9 MB budget enforced at pick time (`lib/upload-limit.ts`), catches added, `app/error.tsx` |
| K4 | **Form drafts** | ✅ `dcb0514` | `lib/draft.ts`: create form and RMA handover autosave to localStorage and offer "Pulihkan" after a reload. Verified end to end in Chrome emulating a Pixel 7, 12/12. Phone testing over LAN: `DEV_LAN_ORIGIN=<lan ip> npx next dev --webpack -H 0.0.0.0` |
| K5 | **Handover failed on a long "Hasil Tes"** | ✅ `4d10d27` | Reported from production with a phone screenshot: "Terjadi kesalahan di server". `RmaCase.test_result` was `VARCHAR(191)` while the rest of the form was `TEXT`, and `STRICT_TRANS_TABLES` refuses an over-long value — the one free-text column the MariaDB port (M3) missed; broken since the cutover. `stock_origin` (both tables) widened with it. Migration `20261016032623_rma_free_text_columns` **applied to production 2026-10-16** together with K1's, by the owner through the tunnel; `migrate status` up to date. The fix needed no code deploy. The remaining `VARCHAR(191)` strings hold codes and numbers |

### SPRINT 2026-10-19 — HNS SSO client (OpenID Connect)
Branch `feat/rma-hold-reason`. **806 tests**, `tsc` clean, production build passes. Not pushed.
Runbook: `docs/sso-hns.md`. Spec: `HNS-SSO-CLIENT.md`.

| # | Task | Status | Notes |
|---|------|--------|-------|
| SSO1 | **Confidential client, `openid-client` v6** | ✅ | `/auth/sso/login`, `/callback`, `/backchannel-logout`, `/error`, `/auth/session-ended`. PKCE S256, state/nonce/iss checked, id_token verified via JWKS. Redirect URLs come from `SSO_REDIRECT_URI`, never `request.url` (internal behind Hostinger's proxy). **Off until `SSO_*` is set** — the password login is unchanged until then |
| SSO2 | **Sessions checked against the database on every request** | ✅ | `lib/session.ts` now verifies: account active, role unchanged since the cookie was issued, `SsoSession` not revoked (and refreshed when due, with a lock), password allowed under `LOCAL_LOGIN`. Closes QC **H4** (deactivated accounts kept working 7 days). A dead session goes to `/auth/session-ended`, which clears the cookie — straight to `/login` would loop through the proxy. `proxy.ts` now imports `lib/session-token.ts` so it stays free of Prisma |
| SSO3 | **Schema** | ✅ | `User.sso_sub` (unique), `Role.Pending`, `SsoSession`. Migration `20261019020000_sso_client` — ⛔ **`migrate deploy` on production before this reaches `main`** |
| SSO4 | **Account lifecycle** | ✅ | Link by `sub`, else first link by email, else auto-create as `Pending` (no access; `/unauthorized` says so). Customers never linked. `npm run sso:export-users` (CSV outside the repo, refused inside it) and `npm run sso:link-users` (dry run default, `--apply`, `--clear-staff-passwords`). Users page: "Menunggu role" filter, SSO badge, password optional on create |
| SSO5 | **Old SSO removed** | ✅ | `/api/auth/sso-sync` (`sso_token` + `JWT_SECRET`) and the "Sign in with Google (SSO)" button. It deactivated RMA accounts on login and reactivated accounts an admin had disabled (QC M6) |
| SSO6 | Verified | ⚠️ | 23 integration tests drive the real routes with openid-client's own validation (SSO stubbed at the HTTP layer). Against the live server: discovery works and the authorize redirect is correct. **Not yet exercised: a real sign-in** — needs the app registered (dev client recommended). Scripts unit tested, not run on real data |

### SPRINT W4 OCT (2026-10-19 → 24) — Service & Claim, owner's card
Owner's checklist: (1) input nama barang yang dibeli customer, (2) detail harga service,
(3) flow service eksternal, (4) report summary seperti faktur, (5) attachment foto barang
yang diajukan klaim. **Not pushed.** ⛔ Ten migrations wait for production before `main`
moves: `20261019020000_sso_client`, `20261019060000_replaced_part_catalog`,
`20261019080000_attachment_kind`, `20261019100000_access_rules_vendors`,
`20261019120000_ticket_charges`, `20261019140000_vendor_roles_and_claims`,
`20261020020000_ticket_catalog_unit`, `20261020040000_service_jobs` (also inserts the 16
starting jobs), `20261020060000_technician_targets`, `20261020080000_service_job_accurate_item`
— **ten** in all. Production also needs `HNS_API_URL` / `HNS_API_TOKEN`.

Business facts the pricing work rests on (owner, 2026-10-19): the shop is the service
provider but **stocks no parts except laptop RAM and SSD** — an LCD, battery or keyboard is
bought from a supplier per job, and board/IC work goes to another vendor. The shop marks
both up. **The technician enters the selling price and the markup; the cost price is for the
head technician and the store coordinator**, and who sees what must be a setting, not code.
External service lives **inside a service ticket**, not as its own ticket type. The cost
price could come from Accurate's last purchase price, but data.hnsitcenter.id does not
expose one (`price` is 0 everywhere, no purchases endpoint) — until it does, it is typed.

| # | Task | Status | Notes |
|---|------|--------|-------|
| W4-0 | **Replaced parts from the Accurate catalogue** | ✅ `701cf3d` `e8a52b7` | data.hnsitcenter.id `/api/v1/items` (Bearer token, `q` search, `GET /items/{id}`), a **read-only** mirror of Accurate — nothing is written back; purchasing/stock/PO live there. Picker in the parts panel, quantity, server re-reads the item by id. `/admin/reports/parts` + CSV. Facts worth keeping: the API's `price` is **0 for every item**, the first request after idling took 12.5 s (timeout 15 s), and **service parts are not stocked except laptop RAM and SSD** — they are ordered per job, so stock 0 is normal and is not shown |
| W4-5 | **Photos of the claimed unit at intake** | ✅ | Separate uploader in the claim step (images, max 5). New `TicketAttachment.kind` (`invoice` / `unit_photo`, null for the rest): the claim's intake upload is marked `invoice`, the photos `unit_photo`. The RMA case page labels them; the handover's invoice picker no longer offers unit photos. 5 tests |
| W4-F | **Access settings, head technicians, vendor list** | ✅ `ede6e1d` | `lib/access.ts`: seven capabilities (`view_cost`, `edit_cost`, `edit_price`, `view_margin`, `view_finance_report`, `print_invoice`, `manage_vendors`) × six audiences. Defaults live in code; an `AccessRule` row exists only where the owner changed one, and saving a value equal to its default deletes the row. Administrator is always allowed, so nobody can lock the owner out. `User.is_head_technician` (checkbox on the user form, Technician only). `Vendor` list with a kind (`part_supplier` / `repair_service` / `both`), names unique case-insensitively — picked from a list, never typed, because free-text vendor names are what split one supplier into three in the RMA dashboard. Admin → Pengaturan Akses, Admin → Vendor. 10 tests |
| W4-2 | **Rincian Biaya on service tickets** | ✅ | `TicketCharge`: kind (`part` / `external_service` / `service_fee` / `other`), description, quantity, vendor, `unit_cost` ("harga modal") and `unit_price` ("harga jual") as whole Rupiah, **null = not filled in**, which is kept apart from 0. A **part line is created with its `TicketReplacedPart` and cascades with it** — the bill cannot miss a fitted part nor list a removed one; the migration backfilled one line per existing part. Two separate guards on every write: *whose bill it is* (`mayEditCharges` in `lib/charges.ts` — admin and head technician always, coordinator for own stores, the holding technician and the assigned sales until `completed`/`cancelled`/`rejected`) and *which field* (`edit_price`, `edit_cost`). A field the caller may not set is **refused when sent and untouched when absent**, so a technician saving a price never erases a cost. **A cost the viewer may not see is stripped on the server** (`loadTicketCharges`) — verified in the browser that the figure is absent from the page source. Margin requires cost visibility, and setting a cost requires seeing it, whatever the settings say: margin and total together give the cost away. One panel (`components/service/ChargesPanel.tsx`) on the technician, admin and sales ticket pages via `loadChargesPanel` |
| W4-3 | **External service inside a service ticket** | ✅ | An `external_service` line *is* the trip: adding it requires an active `repair_service`/`both` vendor and stamps `sent_at`; **Terima** records `returned_at`, the result (`repaired` / `not_repaired`, the latter needing the vendor's note) and the prices known by then, conditionally so two people receiving at once record it once. **A service ticket cannot go to `done` while work is at a vendor** — guard 4 in `updateTicketStatusAction` and its mirror in `adminUpdateTicketStatusAction`. 51 tests for W4-2/3 (28 pure, 23 through the real actions), plus an 18-step Playwright run on the dev server: technician on a Pixel 7, admin on desktop |
| W4-V | **The vendor list serves the RMA desk too** | ✅ | Owner's ask. A vendor's single `kind` became three flags — `supplies_parts`, `repairs`, `handles_claims` — because one company is often several (a distributor sells parts and takes its brand's claims); the migration converts the old kind before dropping it. `RmaCase.vendor_id` → `Vendor`; `vendor_name` stays as the name at the time, so the dashboard and history read unchanged. **"Ajukan ke Vendor" picks from the claim vendors**, and a name typed instead is matched to the list the way the unique index compares names (case-insensitive, whitespace collapsed) — an existing vendor learns it takes claims, a new one is created only after the transition passed its checks. So the desk is never blocked and one vendor stays one row. **The migration backfills** every vendor name already typed on a case into the list and links the cases; the SQL was proven first on a scratch database with "Asus Service Center" / "ASUS SERVICE CENTER" / "  Asus   Service  Center " (→ one vendor), a name already listed as a parts supplier (→ gains the claims role, no duplicate), "iBox" (capitalisation kept) and blanks (skipped). `/rma/vendors` + sidebar entry; `manage_vendors` now defaults to RMA too. A claims-only vendor is offered on no service bill. `canonicalVendorName` and its 8 tests removed — the index does that job now. 892 tests, 10/10 browser steps (RMA desk + admin). ⚠️ Head technicians and coordinators hold `manage_vendors` but the technician portal has no vendor page yet |
| W4-N | **Admin sidebar grouped** | ✅ | Owner: "kebanyakan banget". Fourteen flat entries became Dashboard, four folding groups — **Tiket**, **Klaim & RMA**, **Laporan**, **Data Master** — and Pengaturan Akses. A group opens by itself when it holds the page on screen; Tiket starts open. Profile left the sidebar (it is in the name menu, top right). **An administrator on `/rma/*` keeps the admin sidebar**: `app/rma/layout.tsx` renders the admin shell for them, with the RMA pages in the Klaim & RMA group — before, the "RMA" entry moved them into the desk's portal with a different sidebar and no way back. Icon-only mode lists every entry with a rule between groups. **Then the other portals, on the owner's go-ahead:** Technician = Dashboard / Tiket / Tim (Schedule, Leaderboard), Sales = Dashboard / Tiket, RMA = Dashboard / Tiket / Log Aktivitas / Vendor — their groups start open, so nothing is a click further away. Two dead links fixed on the way: Sales' sidebar Profile went to `/sales/profile`, which does not exist, and its name-menu Profile to `/admin/profile`, which is Administrator-only — both gone (Sales has no profile page); its name-menu My Tickets now opens `/sales/tickets`. Active entry is the longest matching path, with `also` for pages that belong to an entry without sharing its path (`/rma/cases` → Dashboard RMA). 15/15 browser steps: desktop, icon-only, phone, RMA desk; 12/12 for the other portals |
| W4-J | **Daftar Jasa — labour picked, not typed** | ✅ `0ce973e` | Owner, 2026-10-20: technicians' inputs must be fixed choices so their target can be measured and frequently used parts stocked. `ServiceJob` (name, default price, points, active) + `TicketCharge.service_job_id` / `job_points`. A "Jasa service" line must name a job; its name and points are **kept on the line** like its price, so re-weighting a job never rewrites a past month. Default price fills the box for whoever may set prices and is applied as is for whoever may not, including when the job is changed. Older typed lines are flagged until a job is chosen. 16 starting jobs seeded by the migration — the six hardcoded "extra services" (`ExtraPointsPanel`) keep their points; the panel itself is **not removed yet** (decision pending, see BL20). New capability `manage_service_jobs` (admin, coordinator, head technician). Those technicians get a **Data Master** group in the technician portal (`/technician/service-jobs`, `/technician/vendors`), which also closes the gap where they held `manage_vendors` with no page |
| W4-T | **Target Teknisi report** | ✅ `231e4d0` | `/admin/reports/technicians`: per technician per WIB month — tickets, jobs by kind, takings (price × qty), points. A service ticket counts in the month it **first** reached `done` (so BL7 double-done neither double-counts nor moves it), credited to the ticket's technician. All active technicians listed (zeros shown); deactivated ones appear only when they did work. Unpriced lines and typed labour are counted apart and announced. Points are the target's own measure — **not** the leaderboard's. Owner chose all three measures (count, takings, points). No target thresholds yet — a next step if wanted |
| W4-S | **Which parts to stock** | ✅ `84e1a40` | Parts report gains, over 3 months ending with the chosen one: "Sering dipakai" (catalogue items by uses, units, tickets, months active, **stock now** from the catalogue for the top 15, per store and total; ≥3 uses with 0 stock → "Pertimbangkan stok", a prompt not an order) and "Di luar katalog" (typed parts grouped ignoring case and spacing — owner chose "allowed but flagged"). The technician's manual entry says it will be flagged. 18/18 browser checks against an isolated worktree server |
| W4-X | **"Extra Services" ticks retired** | ✅ `2592e3a` | Owner approved. The six ticks recorded the same work the Daftar Jasa now records, so work could be entered twice, and their points were credited nowhere (BL18). Panel, `toggleExtraServiceAction` and the page's `getTicketBasePoints` removed. Tickets that carry ticks keep them in `extra_services`; the list badges that read them are untouched (BL3). Nothing writes new ticks |
| W4-G | **Monthly targets with progress** | ✅ `71bd46e` | `TechnicianTarget` (scope `"default"` or a technician id, `effective_month`, jobs / revenue / points, `use_default`). A target holds **from its month until changed** — changing November's leaves October judged against October's. Default + per-technician override + "back to default". Administrator only, set on the Target Teknisi page. Progress bars in the report; each technician sees their own month on their dashboard (`TargetCard`), counted exactly as the report counts it. 13 tests, 9/9 browser steps |
| W4-P | **What a part usually sells for** | ✅ `fe2823f` | Owner, 2026-10-20: part prices are "by di lapangan" — **not stocked** (only laptop RAM/SSD are), bought per job, the price bargained in a **WhatsApp group with the spare-part suppliers** where they also order, and marked up on the spot; so prices were inconsistent. Owner chose only the history-based guide — **no markup rule, no outlier flag**, and the buy price stays outside the system. `lib/price-reference.ts`: from the ten most recent priced sales of the past year — same SKU, else same typed name in the category, else the whole category with ≥3 sales — range, median, count, last price. Shown under the selling-price box and beside "belum diisi", only to whoever may set prices (`withPriceReferences`); never on the invoice. A guide only: nothing sets or refuses a price. Consequence for W4-H: **HPP helps only RAM/SSD**, so it is no longer the fix for part pricing |
| W4-K | **Accurate codes on the invoice, for the cashier** | ✅ `f1c0f78` | Owner, 2026-10-20: after payment the **cashier re-enters the service into Accurate** — parts by item number, labour by choosing a service item. Nothing is pushed to Accurate (still read-only); instead every invoice line prints the code to type: a catalogue part's SKU, or the Accurate item its Daftar Jasa job is mapped to (`ServiceJob.accurate_item_id/sku/name`, re-read from the catalogue by id). Typed parts, external work and other lines print "—". Daftar Jasa has a "Kode Accurate" column and a one-shot "apply to every unmapped job". Accurate's service items found 2026-10-20: `100688` JASA SERVICE, `101003` Penggantian & Pengecekan, `2507000017` AKOMODASI SERVICE, `101048` JASA RAKIT PC, `2605000304` JASA RAKIT EXPRESS (non-persediaan). Many per-job service parts **are** Accurate items ("… FOR SERV/SERVIS"). **Mapping left empty for the owner to set.** A test once remapped the 16 real jobs through the bulk action; it now restores them |
| W4-H | ⬜ **Harga modal from Accurate HPP** | waiting on owner | **Fact found 2026-10-20 in `ecommerce-hns`:** data.hnsitcenter.id gives each API client its own scopes — `GET /status` returns `{price, cost, stock, warehouseIds, internal, documentTypes}`. The ecommerce client has `cost` (HPP, average cost) on items; **client "Ticketing HNS" has `cost: false`**. The owner enables it in the Data Accurate app → Pengaturan → API & Integrasi. Safe to enable before wiring: `toCatalogItem` passes no cost to browsers. Then: prefill a part line's harga modal from HPP, visible only under `view_cost`. No purchase-invoice integration needed — owner: "cukup unitnya aja" |
| W4-4 | **Faktur Service — for the cashier** | ✅ `3167024` `15d147a` | `/faktur/{ticket}` (top-level, outside the portals so it prints clean; guarded by `print_invoice`, others sent to `/unauthorized`). Store, customer, unit with SKU/SN, dates (in, first done), lines with qty / price / amount, total, customer and cashier signature lines. **A4** or **struk 80 mm** (`?format=struk`) for a receipt printer. **Selling prices only** — lines loaded without cost, no vendor printed (checked in the page source). A line without a price or work still at a vendor makes it a **DRAF**, stamped on paper too. `Ticket.checking_fee` is pointed out on screen, not added — it may already be billed as the "Diagnosa / Pengecekan" job; **owner has not said whether it belongs on the invoice**. No running invoice number: it carries the ticket code. "Cetak faktur" button on the bill. Printed to PDF and inspected. Still open from the card: the finance report (`view_finance_report`), and the shop's own nota layout if it differs |
| W4-1 | **The unit that comes in, picked from the Accurate catalogue** | ✅ | Owner, 2026-10-20: "enggak usah sampai faktur pembelian, cukup unitnya aja" — so **harga modal stays typed** and no purchase data is pulled. The create form's unit name (service, cleaning and claim) is now a catalogue search (`components/catalog/UnitField.tsx`), with "ketik manual" for units the catalogue does not hold; the draft keeps the pick. `Ticket.device_catalog_item_id` / `device_sku` / `device_catalog_category` (indexed on SKU), and `createTicketAction` re-reads the item by id so the name and SKU are the catalogue's — the rule for parts. Catalogue down → a sentence saying to type the name instead, and nothing is created. **`device_name` widened to TEXT**: catalogue names run to ~120 characters ("NB ASUS VIVOBOOK 14 A1400KA … (INDIE BLACK)"), and a typed one could exceed 191 just as `test_result` did (K5). SKU shown on the technician, admin and sales ticket pages and the RMA case page. `CatalogItemPicker` moved to `components/catalog/`, with its dead `px-3 py-2` turned into inline padding. Facts measured 2026-10-20: the API serves only `/items` (6,282) and `/warehouses`; `price` is set on 8 items, all bundles and PC builds — it is the default **selling** price; no vendors, purchases or POs. 6 tests, 8/8 browser steps. Nothing is ever written to Accurate |

### SPRINT 2026-10-24 — moving from hPanel to the VPS (Dokploy)
The owner's runbook: "Migrasi Ticketing Service dari hPanel ke VPS dengan Dokploy" (Tahap 1–8).
VPS `201.18.219.113`, Ubuntu 24.04, Dokploy v0.30.8 at `panel.hnsitcenter.id`. **Shared**: it
already runs `auth-hns` (SSO), `sentral-hns` and `data-accurate`, each with its own MariaDB —
never touch, restart or reuse those.

| # | Task | Status | Notes |
|---|------|--------|-------|
| V1 | **Dockerfile, .dockerignore, `GET /api/health`** | ✅ `15c9b38` on `chore/docker` (cut from `origin/main`), cherry-picked here as `435a907` | Tahap 3 of the runbook. `node:22-bookworm-slim` rather than the runbook's `node:20-alpine` (glibc, like every host so far; Prisma 7 needs ≥ 20.19). `npm run build`, so postbuild still copies `.next/static` + `public/` into standalone. `TZ=Asia/Jakarta` is safe: `@prisma/adapter-mariadb` writes with `getUTC*` and reads `…Z` with `dateStrings`, so stored timestamps do not move; what changes is the handful of places that read local time (RMA `YYMM`, leaderboard default month, monthly winner, RMA queue month start) — now WIB, as the shop means. `/api/health` answers from the process alone (Docker HEALTHCHECK — restarting the app does not bring a DB back); `?db=1` adds `SELECT 1` for an uptime monitor, without error text. `proxy.ts` already lets `/api` through. No `next/image` in the app, so the runbook's `remotePatterns` step does not apply. Health route: 3 tests, one a real `SELECT 1` through the adapter. ⚠️ **The image has never been built** — Docker Desktop on this laptop restarted three times inside `npm ci` (V3); the first real build is Dokploy's. **Merging `chore/docker` to `main` is safe for hPanel** (it ignores the Dockerfile); merging *this* branch is still blocked by the ten migrations |
| V2 | Database facts found the hard way | 📝 | **Dokploy MariaDB "User" must not be `root`.** The image creates `root` from Root Password; a User named `root` creates it twice — `ERROR 1396 Operation CREATE USER failed for 'root'@'%'`, the container exits during setup, Dokploy shows *Start* and "Error reloading Mariadb". Reproduced with `mariadb:11.8`. **Port `33306` on the VPS is `data-accurate`'s database**, not ticketing's. Import goes through `docker exec` on the VPS, so the ticketing DB never needs a public port |
| V3 | Local Docker Desktop is fragile | 📝 | Its VM restarted three times out of three during an image build (`rpc error … EOF` in `npm ci`). After such a restart the published port `127.0.0.1:3310` accepts connections and drops them at once (`ER_SOCKET_UNEXPECTED_CLOSE`, Prisma "pool timeout") while `docker exec` still works — `docker restart hns-ticketing-mariadb` restores it |

**Branches (owner's call, 2026-10-26): Dokploy builds from `deploy`; `main` stays hPanel's**
until the cutover. `deploy` was fast-forwarded to `chore/docker` (`15c9b38`) — `main` plus the four
Docker/health files — so the VPS runs the same code as hPanel. If hPanel also watches `deploy`, that
push redeploys it with the same app plus a Dockerfile it ignores.

**The VPS runs as staging first (owner's call, 2026-10-26):** `staging-ticketing.hnsitcenter.id`,
database `ticketing-db` (Internal Host `ticketing-teknisi-ticketingdb-dvy2im`) holding a copy of
production taken 2026-10-24 (672 tickets / 18 users / 3084 status logs / 41 RMA cases, 7 migrations
= exactly the `deploy` branch's), app service `ticketing-teknisi-ticketing-teknisi-bsqonr` built
from `deploy` and healthy. DNS for `hnsitcenter.id` is Hostinger's (`ns1/ns2.dns-parking.com`).

⛔ **Staging must not share production's R2 bucket.** Deleting a ticket or a replaced part deletes
its files: `deleteFromStorage` removes any URL that starts with this deployment's own
`NEXT_PUBLIC_R2_PUBLIC_URL`. Staging holds production's data, so on the same bucket a test delete
destroys a live ticket's photos. With its own bucket and public URL, old photos still display
(they are stored as absolute URLs) and staging cannot delete them. Same reasoning gives staging
its own `SESSION_SECRET` and no `RESEND_API_KEY`.

After the cutover the deploy rule changes target, not shape: **hPanel's auto-deploy must be
switched off**, and `prisma migrate deploy` runs against the VPS database before any push that
needs it.

### SPRINT 2026-10-27 — catalogue audit: Griya, warehouse allowlist, route guard
Committed as `77ac939` (with BL38) before `feat/ui-foundation` was merged in. Migrations: `20261026090000_catalog_pc_build_upgrade_items`, `20261027020000_vendor_location`.

| # | Task | Status | Notes |
|---|------|--------|-------|
| CA1 | **Griya stock was reaching every staff browser** | ✅ | The data API's rule: never read or show GRIYA (warehouse 350). Client "Ticketing HNS" has `warehouseIds: null` (every warehouse), and `toCatalogItem` passed every row on plus `stock.total`, which counts Griya — a Lenovo BP210 showed "stok total 168", 88 of it Griya. Now an **allowlist**, `STOCK_WAREHOUSE_IDS` in `lib/catalog/items.ts` (owner, 2026-10-26): GUDANG UTAMA 50, NAGOYAHILL 400, GATEWAY 250 — INVENTARIS NAGOYA GATEWAY 150 left out on the owner's word, 2026-10-27. Every other row is dropped on arrival, rows without a numeric id too, and `stockTotal` is summed from what is left instead of read. Live: 910 items, 0 leaking. ⚠️ Owner should still restrict the client in Data Accurate → API & Integrasi to specific warehouses without GRIYA — the docs call 350 appearing a misconfigured client — and drop its unused `purchase-order` document scope |
| CA2 | **Store stock by warehouse id** | ✅ | `stockAtStore(item, { code, name })`: NGH → 400, NGW → 250, by id, absent row = 0. Unmapped stores fall back to name matching. Name matching had **never** found Gateway ("Nagoya Gateway" ≠ "GATEWAY"), so NGW tickets always fell back to the Griya-inflated total. Callers now pass `store` instead of `storeName` |
| CA3 | Catalogue route guard pinned | ✅ | `/api/catalog/items` already required a verified staff session (`proxy.ts` lets all `/api` through, so the handler is the only check). `route.test.ts` pins 401 / 403 for Customer and Pending / 200 for staff, and that the JSON carries no Griya and no token. `STAFF` typed against `Role` |
| CA4 | **Claim stock on the RMA case page** | ✅ | `CLAIM_WAREHOUSE_IDS` = KLAIM GARANSI 450, kept as `CatalogItem.claimWarehouses`, never in `stockTotal` or store figures. "Stok Model Ini di Gudang Klaim" on `/rma/cases/[id]`, streamed under `Suspense` (`ClaimStock.tsx`) so a slow catalogue does not hold the page. Per model, not per serial. A unit typed by hand — usually one not bought here — says so; the intake already searches name and SKU and allows typing (owner's requirement, 2026-10-27). KLAIM PEMASOK is included **by name** (`CLAIM_WAREHOUSE_NAMES`): it does not exist on data.hnsitcenter.id yet (13 warehouses, rechecked 2026-10-27 after that day's sync), so it appears on its own once Accurate has it. Griya (350) is refused even under that name. Not seen rendered: the dev server on :3000 was wedged (H3 quirk) |
| CA5 | **A part's Accurate code, entered after the fact** | ✅ | Owner, 2026-10-27: a part is fitted before Accurate has received it (receiving lags), so it is recorded under a plain name ("Baterai") and its code arrives later. Part lines in Rincian Biaya now show "Kode Accurate …" or **"Menunggu kode Accurate"** with **Masukkan kode**: pick the item (search by code or name), confirm, and `linkPartCatalogAction` re-reads it by id and writes code, name and category to the part and the name to its bill line. Price, quantity and photos untouched. Only a part with no code yet, conditionally (two people linking at once record one). Who: `mayLinkPartCode` = whoever may edit the bill, **plus the holding technician at any status** — the code can arrive after `completed`. Invoice: not a draft; the code column prints "menunggu kode" and the screen says how many. Parts report: "Di luar katalog" lists the tickets to chase. No migration. Not seen rendered (dev server wedged, browser tools off) |
| CA6 | **Parts added from Rincian Biaya — admin included** | ✅ | Owner, 2026-10-27, testing as admin: there was nowhere to enter the LCD. Parts could only be recorded by the technician holding the ticket, in the technician portal. "Part — barang yang dipasang" is now a Jenis biaya: category, the item from the catalogue or a plain name (code later via Masukkan kode), quantity, supplier, prices. `addPartChargeAction` is guarded by the bill rule (`mayEditCharges`), so admin, head technician and coordinator can; it creates the part and its line together, as the panel does. Input checking shared with the panel in `lib/replaced-part-input.ts`. Photos stay with the technician panel. **Part lines are now edited and deleted from the bill too** (owner asked — an admin-added part could not be removed at all, since the panel's delete is for the technician who recorded it): Ubah sets the quantity (written to part and line), and the category and name while the part has no code — a rename is conditional on `sku` still null, so it never overwrites a link made meanwhile; the trash button removes the part, its line, its photo rows and their files. Same bill rule. Walked through in Chromium as admin (add → Ubah → Hapus), plus 2 action tests. **Then, on the owner's word:** the delete question is the app's own dialog (`Modal`, portalled to `<body>`), not `window.confirm`; and **nothing typed in "Tambah biaya" is lost** — switching Jenis biaya keeps the shared fields and brings each kind's own back, and closing the form or reloading keeps it all (autosaved per ticket via `lib/draft.ts`, new `readDraft`); only a successful save or "Kosongkan" clears it. Checked in Chromium, 12/12 |
| CA7 | Create form, claim step: wider unit search, phone layout | ✅ | Owner, 2026-10-27: "Nama Perangkat" sat in half a grid column beside SN, so catalogue results were a tall, narrow strip. Now full width; SN and Tanggal Pembelian share a row (stacked on a phone). The Jenis Kasus buttons are a grid — 2 × 2 on a phone instead of wrapping 3 + 1. Then the form card itself widened 700 → 960 px (owner: "card-nya yang dibenerin"); Choose Device fills the card (five in a row on desktop, 2 columns on a phone instead of one); Assign Technician / Sales stack on a phone instead of truncating; step labels wrap instead of running together. Rincian Biaya states re-checked at 390 px. **"Ketik manual / Cari di katalog" is a button now** (owner: the underlined link was easy to miss) — `components/catalog/CatalogEntryToggle.tsx`, used by the unit field, PC build / upgrade items, the bill's part form and the technician's replaced-parts panel |
| CA8 | **Drafts belong to the account that typed them** | ✅ | A shop computer is shared, and draft keys named no user: the next person signed in on it was offered the previous one's unsent create form — customer name and phone — and the bill draft kept the **cost price** in the browser. `DraftScopeProvider` (in `DashboardShell`) + `useDraftKey` put the account in every key (create form, RMA handover, Rincian Biaya); unscoped drafts left from before are deleted on load; the bill draft never stores `unit_cost` (it stays in the open form only). Sign-out deliberately untouched — auth moves to SSO. Checked in Chromium with two accounts in one browser, 6/6. **Then the create form stopped asking** (owner: it already autosaves — why ask?): the draft is restored on its own after hydration, with a small "Isian sebelumnya dipulihkan · Kosongkan" line instead of the Pulihkan/Mulai baru banner. Safe now that drafts are per account. The RMA handover still asks (`DraftBanner`, whose dead `p-4` was fixed). 8/8 in Chromium, no hydration error |
| CA9 | **Claim vendor list + location (LKL/ITR)** | ✅ | Owner's list of 40 service centres / suppliers, 2026-10-27: `prisma/data/claim-vendors.ts` (renamed `prisma/data/vendors.ts` in X6). New `Vendor.location` (`VendorLocation`: `in_town` = LKL dalam kota, `out_of_town` = ITR luar kota, null = not recorded) — migration `20261027020000_vendor_location`, ⛔ **`migrate deploy` before this reaches production**. Loaded by `npm run seed` and by **`npm run import:vendors`** (dry run; `--apply` writes), which is the one for staging/production: additive only — creates missing names as claim vendors, gives existing ones (matched case-insensitively, spelling kept) `handles_claims` and the list's location, never deletes, renames, reactivates or touches other roles. New vendors later: append to the file, run the import. Location is a select on the vendor forms, a pill in the list, beside each name in the RMA "Vendor Klaim" picker, and "Lokasi Vendor" on the case page. 7 tests; applied locally (40 added, rerun = 40 unchanged). Not seen rendered: the running dev server held the old Prisma client (`Unknown field location`) and needs a restart |
| CA10 | **A reload no longer signs staff out** | ✅ | Owner, 2026-10-27: on a weak signal the page reloaded, staff landed on /login and typed the ticket again. Cause: SY1 — without \"Remember me\" the session cookie had no lifetime, and Android Chrome drops such cookies whenever its process ends (signal, camera, low memory). The SSO callback never passes \"Remember me\", so after SSO it would have hit everyone. `sessionCookieOptions` now always sets `maxAge`: 12 h (one shift) by default and for SSO, 7 days when remembered. Proven in Chromium with a real password login, then a simulated browser restart (session-only cookies discarded): still signed in, and the half-typed ticket restored on its own (CA8) |
| CA11 | Catalogue search indicator, honest upload errors | ✅ | Owner, 2026-10-28. (1) The browser's own clear cross of `type=\"search\"` sat where the picker's spinner spins, and the two overlapped. Now `type=\"text\"` with one slot: spinner while busy, an app cross when done; \"Mencari di katalog Accurate…\" under the box (a cold catalogue takes ~12 s); \"Tidak ada barang yang cocok\" no longer flashes during the debounce. (2) \"Failed to upload the invoice. Please check the file size\" was local MinIO answering \"socket hang up\" — the V3 port fault; `docker restart hns-minio` fixed it, upload verified through `uploadToR2`. The five upload errors that blamed file size (size is checked in the browser first) now say the file store could not be reached — `storageFailedMessage` in `lib/upload-limit.ts`. 6/6 in Chromium |

### SPRINT UI-1 2026-10-28 — UI overhaul, Phase 1: design system foundation
Branch `feat/ui-foundation`, started off `main` `74bf5b3` and rebased onto `feat/catalog-pcbuild-upgrade` `2e7f87e` the same day (owner's call: that branch holds the current grouped sidebar Phase 2 rebuilds, so UI work lands after it). Presentation layer only: no server action, schema, `lib/kpi.ts`, `lib/points.ts`, `lib/routes.ts` or `proxy.ts` touched, and no production page edited. **Owner decisions 2026-10-28:** map the brand onto the shadcn tokens globally (accepting the one visible change below); exempt `[data-slot]` from the legacy reset instead of moving it; keep the ticket status labels staff use today until an Indonesian list is approved; do the work on its own branch.

| # | Task | Status | Notes |
|---|------|--------|-------|
| UI1.1 | **Audit** | ✅ `307869d` | `docs/ui-audit.md`: 1,835 `style={{}}` in 95 files, 1,258 vanilla-class uses, 120 classes, per file with phase and priority. Two traps written up there: the unlayered reset that kills Tailwind spacing, and legacy CSS reading the shadcn token names |
| UI1.2 | **Brand tokens on the shadcn variables** | ✅ `fc6c5aa` | `--primary` #16469d, `--destructive` #cd2426, `--background` cream, `--muted` #ede7de, `--muted-foreground` #5c6676 (5.2:1 on cream; legacy `--text-muted` is 3.6:1), `--input` #8a8279 (3.8:1, control boundary), `--ring` blue, sidebar tokens for Phase 2, nine `--tone-*` triplets for statuses, HNS-tinted `shadow-*`, `font-sans` = Inter (was a circular var pointing at Geist). ⚠️ **The one production-visible change:** legacy CSS reads `var(--primary)` 143×, and it had been near-black since the shadcn init `0b3dd66` (2026-05-19) — so every `.btn-primary`, link and focus ring turns HNS blue again. Approved. `.dark` untouched (Phase 7) |
| UI1.3 | **Reset exemption** | ✅ `fc6c5aa` | The legacy `*` reset, `h1–h4`, `p`, `a`, `:focus-visible` and the `table/thead/tbody` rules skip `[data-slot]` subtrees via `:where(:not([data-slot], [data-slot] *))` — specificity unchanged. Verified in the browser: production pages carry 0 `[data-slot]` elements and a dead `mt-1` on `/admin/tickets` still computes to 0 |
| UI1.4 | **shadcn components** | ✅ `5cf237b` | input, textarea, select, dialog, dropdown-menu, table, tabs, sheet, skeleton, tooltip, avatar, alert, label. Below `md` every button, input, select, menu item and tab is ≥ 44px; desktop density from `md`. Alert gained `success`/`warning`/`info` tone variants; close labels say "Tutup". ⚠️ `shadcn add` rewrote `import { cn } from "@/lib/utils"` to the npm package `cn` and added it to `package.json` — reverted; check every future `shadcn add` diff for this |
| UI1.5 | **Domain components** `components/app/` | ✅ `c55a987` | `StatusBadge` (exhaustive over both enums via `lib/status-display.ts`; a test holds RMA labels equal to `RMA_STATUS_META` until RmaStatusCard moves over), `PageHeader` (breadcrumb, actions stack on phones), `StatCard` (+ skeleton; `attention` turns red only when not zero), `EmptyState`, `DataTable` (table from `md`, cards below, skeleton and empty states, server component so `cell` can be a function; replaces `.admin-ticket-table`/`.admin-ticket-cards`), `FilterBar` (GET form, `role="search"`), `Pagination` (links; never strands you past the end — `lib/pagination.ts`), `ConfirmDialog` (locks while pending, shows a failed action's message, stays open) |
| UI1.6 | **`/dev/ui`** | ✅ `21918f3` | Every token and component in light mode. `notFound()` in production; no data, no clock. Checked at 360×800 and 1440×900: no horizontal scroll, touch targets ≥ 44px at 360, keyboard works in dialog/menu/sheet (Esc closes, focus returns), no console errors |
| UI1.7 | **Indonesian ticket status labels** | ⬜ | Waiting on the owner. Ticket labels are still "Waiting", "On Progress", … (emoji dropped). One switch in `lib/status-display.ts` when approved |

Checks: `tsc` clean; every new or changed file lints clean (repo-wide `npm run lint` was already failing on `main` before this sprint — 92 errors, 62 warnings — and the count did not rise); tests 749 → 789.

### SPRINT UI-2 2026-10-28 — UI overhaul, Phase 2: app shell
Branch `feat/ui-foundation` (on top of `feat/catalog-pcbuild-upgrade` `2e7f87e`). Presentation only: menu data, active-entry rule, group open/close rule, `localStorage` key, polling and every fetch are unchanged. **Owner decisions 2026-10-28:** sidebar stays HNS blue (not shadcn white); menu labels unchanged.

| # | Task | Status | Notes |
|---|------|--------|-------|
| UI2.1 | **shadcn sidebar + collapsible** | ✅ `df50377` | `components/ui/sidebar.tsx`, `collapsible.tsx`, `hooks/use-mobile.ts`. Changed from upstream: the provider wrapper and `SidebarInset` say `data-shell`, **not** `data-slot` — they wrap every legacy page, and a `data-slot` there would switch off the legacy reset for all of them (UI-1); the `sidebar_state` cookie is gone (collapse lives in `localStorage`, as before); menu items 44px below `md`; the legacy blue gradient (`#153f8a → #0d2a5e`); `useIsMobile` is a `useSyncExternalStore` (false on the server, so no hydration mismatch). `--sidebar-*` tokens now blue, white text 9.9:1, focus ring white. ⚠️ `shadcn add` again rewrote `cn` to the npm package and touched `package.json` — reverted |
| UI2.2 | **`DashboardShell` rebuilt** | ✅ `032a60b` | Same props, same `NAV_SECTIONS` / `sectionsFor` / `matchScore` (copied, not rewritten). Desktop collapses to icons with tooltips; `sidebar_collapsed` read through `useSyncExternalStore`. Phone: Sheet from the left, swipe right to open / left to close (thresholds as before; the finger-following drag is gone). Profile menu is a shadcn DropdownMenu — keyboard-operable, and **Sign Out is readable red**: it was `var(--accent)`, near-white since the shadcn init. Skip link "Langsung ke konten". The page sits in `<main id="konten">` with **no** `data-slot`. `overflow-x-clip` on the frame replaces the old `overflow-x-hidden`: `/admin/tickets` at 360px has a `.mobile-ticket-card` badge 109px past the edge (a legacy page defect for Phase 4) that the old shell hid too; `clip`, not `hidden`, keeps the top bar sticky |
| UI2.3 | **Bells restyled** | ✅ `032a60b` | `NotificationBell` / `RequestsBell`: only JSX changed — diff shows no fetch, interval or `POLL_MS` line touched. 44px triggers with a count (9+), Esc closes, skeleton while loading, tone tokens. "Mark all read" was white on `var(--accent)` (near-white) — now primary. The 4 pre-existing `set-state-in-effect` lint errors are in the polling code and were left alone on purpose |
| UI2.4 | **Legacy shell CSS removed** | ✅ `032a60b` | 296 lines: `.sidebar*`, `.dashboard-layout/-main/-topbar`, `.mobile-menu-btn`, `.notif-bell/-dot`, `.dropdown-item*`, `--sidebar-width`. Each grep-proven unused first. `.dashboard-content` kept. `globals.css` 1,606 → 1,310 lines |
| UI2.5 | **Verification** | ✅ | All four portals logged in with the seed accounts (admin, technician, sales, rma) at 360×800 and 1024–1440: no horizontal scroll, topbar buttons and sheet items 44px at 360, active entry and topbar label right on every page, admin keeps its own sidebar on `/rma/*` with "Klaim & RMA" open. Collapse persists across navigation; swipe open/close verified with synthetic touch events; Sign Out from the dropdown logs out. Every admin and RMA menu page (24, incl. a ticket and a case detail) answers 200 inside the new shell. No console or server errors |
| UI2.6 | **Coordinator view** | ✅ | Seen live during UI-3a (budi temporarily `is_team_leader` in the local DB, then reverted): the RequestsBell shows in the technician portal. The seed has no coordinator account |

Checks: `tsc` clean; repo lint 147 → 141 problems (the old shell's 3 errors + 3 warnings gone; nothing new); tests 1014 pass; `npm run build` passes.

⚠️ **Dev-only trap found:** `next.config.ts` sends `Cache-Control: public, max-age=31536000, immutable` for `/_next/static/(.*)` — Next warns about it at startup. In `next dev` chunk URLs do not change across edits, so the browser keeps running the **old** client code: the result is a hydration error that is not in the code (server renders new, browser hydrates old). Work around with a fresh port or a hard refresh; the real fix is to send that header only in production.

### SPRINT UI-3a 2026-10-28 — UI overhaul, Phase 3a: technician pages outside the WIP
Phase 3 is split by the owner's call (2026-10-28): the four heaviest technician files — ticket detail `page.tsx`, `StatusUpdater`, `ReplacedPartsPanel`, `CreateTicketForm` (and `ChargesPanel`) — are being changed in uncommitted work on `feat/catalog-pcbuild-upgrade`, so they are **3b**, after that work is committed. 3a is everything else in `app/technician`. Presentation only: queries, actions, points and sorting untouched; staff-facing English kept word for word.

| # | Task | Status | Notes |
|---|------|--------|-------|
| UI3a.1 | **components/app additions** | ✅ `b5f44cb` | StatusBadge takes `hasTechnician` / `paused` → "Waiting for Work" / "Waiting for Technician" / "Paused", the legacy badge's words (tests). DataTable: `footer` card slot, `rowClassName`, node headers + `mobileLabel`. Pagination `labels`. New `FilterChips`, `PointsBadge`. `DialogHeader` reserves room for the close button |
| UI3a.2 | **Dashboard** | ✅ `8a6ea89` | Owner-approved order: active tickets → available tickets → stats and target folded in "Statistik & Target". Request Ticket = ConfirmDialog with the old text and the old outcome (toast, then close). 68 → 0 inline styles |
| UI3a.3 | **Ticket list + skeletons + hold panel** | ✅ `c0ffb2d` | FilterBar (GET), FilterChips, DataTable with the three sort links, "Prev / Next / Page x of y", "Showing a–b of n tickets". `HoldEvidencePanel` migrated; its legacy `FileUpload` is wrapped in the legacy p size so it renders unchanged. 77 → 3 |
| UI3a.4 | **Leaderboard** | ✅ `6f48dc0` | Same podium/Top 5/rankings. Two columns only from `xl` (at 1024px the side list was ~200px and cut names to "R.."). 65 → 29, all per-rank colours/heights/delays |
| UI3a.5 | **Profile + Schedule** | ✅ `6a15895` | "Cancelled" stat and "Access Denied" were `var(--accent)` (near-white) — now red. `ProfileForm` / `ChangePasswordForm` stay legacy (shared with admin, Phase 4): the profile root deliberately has **no** `data-slot`. Schedule dialog = shadcn Dialog + Tabs. 42 → 3 |
| UI3a.6 | **Unused CSS** | ✅ `5da4d7b` | `.workload-bar/-fill`, `.tech-stats-grid`, `.tech-workload-card` (−43 lines; `globals.css` 1,267) |
| UI3a.7 | **Verification** | ✅ | budi at 360×800 and 1024: dashboard, list (search keeps `q`, chips keep it too, Clear link identical), leaderboard both tabs, profile, schedule (denied and coordinator). Request Ticket → "Requested" + Cancel → "Request cancelled." round trip on the local DB. Local fixtures used and **reverted**: budi assigned to a store and made coordinator for the test, both undone; the request was cancelled. No console errors |
| UI3b | **Ticket detail, StatusUpdater (proof upload), ReplacedPartsPanel, CreateTicketForm, ChargesPanel** | ✅ | Done in SPRINT UI-3b below, after the WIP was committed (`77ac939`). (`ProfileForm` / `ChangePasswordForm` were migrated in UI-4a) |

Checks: `tsc` clean; repo lint 141 → 129 problems; tests 1016 pass; `npm run build` passes. Inline styles in the 3a files: 256 → 35, every one a runtime value.

**Pattern worth reusing:** a migrated page that still embeds a legacy component keeps its root **without** `data-slot` and lets each new section bring its own (Card, StatCard, PageHeader…); a page built only from new pieces puts `data-slot` on its root.

### SPRINT UI-4a 2026-10-30 — UI overhaul, Phase 4a: admin pages outside the WIP
Same split as 3a, owner's call (2026-10-28): `app/admin/tickets/[id]/page.tsx` is in the uncommitted work on `feat/catalog-pcbuild-upgrade`, so it is **4b**; its panels are not, and keep their props, so the WIP merges over them. Presentation only: queries, actions, points, figures and staff wording untouched.

| # | Task | Status | Notes |
|---|------|--------|-------|
| UI4a.1 | **Skeletons + 1024px tables** | ✅ `b43cccb` | `PageSkeleton` (dashboard / list / form / report) replaces seven hand-styled admin `loading.tsx`. DataTable cells wrap; Type and View columns only from `xl`; long codes truncate with a tooltip |
| UI4a.2 | **Dashboard + All Tickets** | ✅ `d63c5ba` | Unassigned first among the stat cards; org stats + Top Technicians folded on a phone. Ticket list = FilterBar + FilterChips + DataTable + Pagination ("Prev / Next"). `orderBy` typed |
| UI4a.3 | **Form primitives** | ✅ `8f8f196` | `FormField`, `PasswordInput` (44px eye, `aria-pressed`), `NativeSelect`, `RoleBadge` + `roleDisplay()` (tests), `errorOf()` in `lib/action-result.ts` (tests) |
| UI4a.4 | **Users, stores, profile, access** | ✅ `6bde9fb` `4fbd82b` `4dcf637` `aa36dff` | Deactivate flow = one Dialog through its three steps. Store delete = ConfirmDialog. `ProfileForm` / `ChangePasswordForm` (shared with technicians) on Card + FormField, same strength thresholds. Pengaturan Akses: one card per capability with labelled checkboxes instead of a table that scrolled sideways at 360px — same field names and defaults |
| UI4a.5 | **Performance** | ✅ `7883527` | One DataTable instead of the table + cards pair; Shift / Active from `xl`. Share Winner and Export PDF are shadcn Dialogs; the print template is untouched. The share canvas draws through a callback ref, because the dialog portal mounts it a render late |
| UI4a.6 | **Leaderboard** | ✅ `a6d80b6` | Reuses `PodiumBars` / `Top5Bars` from the technician leaderboard instead of a copy. Removed `.leaderboard-layout/-chart/-list` and `@keyframes growBar` |
| UI4a.7 | **Logs + Target Teknisi** | ✅ `e5acee0` `72342a5` | Logs: StatusBadge for old → new, whole row links to the ticket, shared Pagination, `where` typed. Target editor opens a Dialog instead of unfolding inside the table cell; `ProgressBar` on Tailwind classes, same colours. `RupiahInput` left legacy (also in ChargesPanel, ServiceJobForms) |
| UI4a.8 | **Ticket detail panels** | ✅ `7d5f276` `d4e3e90` | **Fix:** Reject / Cancel were `var(--accent)` — cream under white text since UI-1 — now solid destructive. Proof-upload modals and the delete dialog are shadcn Dialogs. `PcBuildHandover` (also on the sales and technician pages) 52 → 0 inline styles. Public Chat is a real `role="switch"`. `[id]/loading.tsx` re-exports the technician skeleton |
| UI4a.9 | **Verification** | ✅ | admin at 360×800 and 1024: every page above, both leaderboard tabs, all dialogs opened and closed (delete dialog opened for its counts only — nothing deleted, no target saved). Waiting / on_progress / done / PC Build tickets checked. No horizontal scroll, no console errors |
| UI4b | **Admin ticket detail page, reports/parts, vendors, `components/tickets/*`, `RupiahInput`** | ⬜ | Waits for the WIP to be committed |

Checks: `tsc` clean; repo lint 129 → 88 problems; tests 1025 pass; `npm run build` passes. Inline styles in the 49 files 4a touched: 579 → 10, every one a runtime value.

**Found, not fixed:** the dashboard's Unassigned card links `/admin/tickets?assigned=false`, but the list ignores `assigned` and shows every ticket. Pre-existing; fixing it is a query change, so it needs the owner's word.

**Gotcha:** the built-in browser pane only paints while visible, so a screenshot right after opening a dialog can show it mid-animation or not at all. Check `[data-slot=dialog-content]` with JS before calling it a bug.

### SPRINT UI-5a 2026-10-30 — UI overhaul, Phase 5a: RMA desk and Sales outside the WIP
Same split again: the RMA case page (`cases/[id]/page.tsx`, `RmaActionPanel`, the new `ClaimStock`), the Sales ticket detail and `VendorDirectory` are in the uncommitted work on `feat/catalog-pcbuild-upgrade`, so they are **5b**. Owner's call on the RMA dashboard (2026-10-30): **restyle only** — same sections, order and numbers; the BL28c rebuild stays its own item, and so does the `NEEDS_ACTION` fix in `lib/rma/queue.ts`. Presentation only: no query, action, SLA or wording changed.

| # | Task | Status | Notes |
|---|------|--------|-------|
| UI5a.1 | **Sales dashboard + My Tickets** | ✅ `8c69b34` | StatCards, 44px buttons. The list follows the technician list from UI-3a (FilterBar, FilterChips, DataTable, Pagination). `status as any` typed |
| UI5a.2 | **Klaim Garansi (`/rma/tickets`)** | ✅ `ab76443` | Same list pattern. A claim "belum diserahkan" stays unlinked (no page for it): `DataTable.rowHref` may now return `undefined`. StatusBadge via `ticketBadgeChoice`. Points from `xl` so 1024px fits |
| UI5a.3 | **RMA dashboard** | ✅ `6fa6404` | Shared StatCard (new amber `warning` tone). On a phone the four daily numbers stay on top and the other three plus Klaim per Merek / Tipe, Hasil Klaim, Case per Vendor fold into "Statistik jangka panjang"; from md the page reads as before (cards 4 + 3). AttentionCard on tones with 44px rows. Dashboard and case skeletons |
| UI5a.4 | **Log Aktivitas (`/rma/logs`)** | ✅ `d1a929a` | Per Case keeps `<details>` (no client JS). Kronologis was a table with `min-width: 860px` that scrolled sideways on a phone — now a DataTable per day, a card per event on a phone. `.rma-log-*` CSS removed. 79 → 0 inline styles |
| UI5a.5 | **RmaStatusCard + create pages** | ✅ `6511602` | Card with a `<dl>` grid; every export unchanged (WIP files read `rmaStatusMeta(...).colors`). RMA / Sales "Create New Ticket" get a PageHeader over the legacy form |
| UI5a.6 | **Verification** | ✅ | Sales (sales@ seed: no tickets, so the list was seen empty — its table is the 3a one) and RMA (rma@ seed) at 360×800 and 1024: dashboards, Klaim Garansi (7 linked / 3 unlinked rows), dashboard fold, both log views, a case page's RmaStatusCard, the create page. No horizontal scroll. Nothing created or changed |
| UI5b | **RMA case page + RmaActionPanel + ClaimStock, Sales ticket detail, RMA vendors** | ⬜ | Waits for the WIP to be committed |

Checks: `tsc` clean; repo lint 88 → 86 problems; tests 1025 pass; `npm run build` passes. Inline styles in the 13 files 5a touched: 289 → 1 (a bar width).

### SPRINT UI-6a 2026-10-30 — UI overhaul, Phase 6a: public page, login, error pages
`app/faktur/[id]` is in the uncommitted work on `feat/catalog-pcbuild-upgrade`, so it is **6b**. Presentation only, with **one wording change approved by the owner (2026-10-30)**: the public page's header badge.

| # | Task | Status | Notes |
|---|------|--------|-------|
| UI6a.1 | **Customer status page + PublicChat** | ✅ `e6bd496` | **Owner's call:** the header badge shows `publicStatusLabel()` — the customer wording the timeline already used — instead of the staff badge ("⏳ Waiting for Work"). Query and field-by-field selects untouched (no internal RMA field can reach it). Outcome banner on tones with icons instead of emoji. Chat: labelled inputs, 44px send button with a name, brand blue instead of indigo, `as any` → `errorOf()`. 51 → 0 |
| UI6a.2 | **Login + SSO error** | ✅ `e974f62` | New `components/app/AuthShell` replaces `.auth-container` / `.auth-card` (removed). FormField + PasswordInput (the eye had no label), Alerts, 44px Remember me. **Fix:** the "atau masuk dengan password" divider label sat on `var(--background)` — cream since UI-1 — a strip on the white card |
| UI6a.3 | **Outline links had no border** | ✅ `b032472` | cva only concatenates: a Link styled with `buttonVariants({ variant: "outline" })` carried both `border-transparent` (base) and `border-border`, and transparent won. `buttonVariants()` now returns the `cn()`-merged string; its 18 callers are unchanged and every outline link since UI-1 gets its border back |
| UI6a.4 | **Error boundary + /unauthorized** | ✅ `8b9a3a1` | `/unauthorized` was a near-black screen; now the cream AuthShell card. Same words |
| UI6a.5 | **Verification** | ✅ | Public page at 360 and 1024 on two local tickets (a claim in progress, a claim with "Unit diganti oleh vendor"); no ticket has public chat on, so only the "Chat dinonaktifkan" state was seen. Login (password-only locally; a wrong local test login shows the Alert), SSO error, /unauthorized. Share links were read with a temporary read-only script, deleted after |
| UI6b | **Faktur page** | ⬜ | Waits for the WIP to be committed |

Checks: `tsc` clean; repo lint 86 → 84 problems; tests 1025 pass; `npm run build` passes. Inline styles in the 8 files 6a touched: 79 → 0.

**Not done, needs the owner:** the app has no `not-found.tsx`, so a mistyped share link shows Next's default 404 — a page of its own means new customer-facing words. The public page reads `Date.now()` during render (server component, so no hydration fault) and keeps an unused `shareUrl`; both pre-existing and left alone.

### SPRINT UI-7a 2026-10-31 — UI overhaul, Phase 7a: shared leftovers and dead CSS
Owner's go-ahead 2026-10-31 while the WIP on `feat/catalog-pcbuild-upgrade` is still uncommitted: nothing here edits a WIP file. 7b — dropping the global reset and the rest of the legacy CSS — waits for the WIP and the b-phases.

| # | Task | Status | Notes |
|---|------|--------|-------|
| UI7a.1 | **Badge + Modal as adapters** | ✅ `088c498` | Same props, so every caller — WIP pages included — changes look untouched. `Badge` draws through `lib/status-display.ts` (same "Waiting for Work / for Technician / Paused" logic, no emoji); `Modal` is the shadcn Dialog, `maxWidth` kept but capped at the screen less 1rem a side. Delete both in 7b |
| UI7a.2 | **TicketChat, FileUpload, FilePreview** | ✅ `ef3ae42` | FileUpload's drop zone is a real `<button>` (a keyboard could not reach the old div); remove buttons named and 44px. FilePreview still honours a caller's legacy `className`. `/dev/ui` gains "Komponen bersama" to check them without walking a wizard |
| UI7a.3 | **TagInput, PickupMethodSelector, RupiahInput** | ✅ `510db18` | The pickup label is now tied to its select. `RichTextEditor` left alone: only `app/customer/*` (dead code, BL8/BL29) uses it |
| UI7a.4 | **Daftar Jasa + create headers** | ✅ `5d53804` | DataTable (phone cards); "Ubah" opens a Dialog instead of replacing the table row. Admin / technician "Create New Ticket" get a PageHeader over the legacy form |
| UI7a.5 | **Dead CSS** | ✅ `cd2fae3` | `globals.css` 1197 → 887 lines: 65 selectors no source mentions, in this branch **or** in the WIP versions (script checks both trees and `name-${x}` forms). Kept: `.dark`, `.is-editor-empty` (Tiptap), `.tiptap-content` and every class the WIP still reads |
| UI7a.6 | **Verification** | ✅ | Admin ticket detail (badges, chat, pickup select), the RMA "Tahan" action through the Modal adapter (opened and closed, nothing saved), Daftar Jasa with its edit dialog (not saved), create page, `/dev/ui` demos — 360 and 1024, no horizontal scroll |
| UI7b | **Drop the unlayered reset + `[data-slot]` exemption, remaining legacy classes and tokens, the Badge/Modal adapters; final numbers into `docs/ui-audit.md`** | ⬜ | After the WIP is committed and 3b / 4b / 5b / 6b are done |

Checks: `tsc` clean; repo lint 84 → 83 problems; tests 1025 pass; `npm run build` passes. Inline styles in the 14 files 7a touched: 70 → 1 (a computed width).

**Still open for the owner:** delete the unused `LeaderboardSnapshot.tsx` and `TermsModal.tsx`?; dark mode (after 7b); a `not-found.tsx`.

### SPRINT UI-3b 2026-10-31 — UI overhaul, Phase 3b: technician ticket detail and the intake wizard
After the owner committed the WIP (`77ac939`) and merged the UI branch into it (conflicts resolved in `beb62ae`: the new shell keeps `DraftScopeProvider` inside `<main id="konten">`). Presentation only: actions, validation, drafts and status rules untouched; staff-facing text kept word for word. **Not pushed** — the owner approves any push or merge to main.

| # | Task | Status | Notes |
|---|------|--------|-------|
| UI3b.1 | **Ticket detail sections** | ✅ `4d634dc` | New `components/tickets/TicketSections.tsx` (DetailCard, TicketHeader, CustomerInfoCard, AttachmentsCard, StatusHistoryCard, ProofAttachmentsCard) + `proof.ts`; `IntakeItems` on DetailCard. Reusable by the admin / sales / RMA detail pages in 4b and 5b |
| UI3b.2 | **StatusUpdater** | ✅ `1dbd39b` | Owner's choice "B": on a phone the actions are pinned to the bottom of the screen; from md they sit in the header. Dialogs on FormField / Textarea / NativeSelect. Logic diff-checked identical |
| UI3b.3 | **ReplacedPartsPanel** | ✅ `e6fe9ef` | Card + form primitives, 44px photo picker, icon delete |
| UI3b.4 | **ChargesPanel + catalog picker** | ✅ `c2ecfef` | Tone pills per charge kind; `CatalogItemPicker` / `CatalogEntryToggle` on tokens |
| UI3b.5 | **CreateTicketForm (staff wizard, 4 create pages)** | ✅ `5662b13` | Phone: "Langkah X dari 4" + progress bar instead of four squeezed circles. Device tiles, case and upgrade chips are `aria-pressed` toggles; checkbox groups are fieldsets. `UnitField` / `CatalogItemList` migrated; create page roots get a data-slot. Draft restore and "Kosongkan" checked live |
| UI3b.6 | **Verification** | ✅ | Seed ticket DEMO-000002 temporarily assigned to budi (restored afterwards): detail, every StatusUpdater dialog opened and closed, parts / charges forms and catalog search — nothing saved. Wizard walked to Confirm, not submitted, test draft discarded. 360 and 1024, no horizontal scroll |

Checks: `tsc` clean; repo lint 77 problems (was 83 at 7a); tests 1079 pass; `npm run build` passes. Inline styles in the 3b files: 401 → 1 (the stepper's computed width). `app/customer/tickets/create/CreateTicketForm.tsx` left alone — dead customer portal (BL8/BL29).

### SPRINT 2026-11-02 — All Tickets to Excel
Branch `feat/catalog-pcbuild-upgrade`. Not committed. No migration.

| # | Task | Status | Notes |
|---|------|--------|-------|
| X1 | **Export Excel on All Tickets** | ✅ | Owner asked. "Export Excel" button on `/admin/tickets` → `GET /admin/tickets/export`, **Administrator only** (checked in the handler too — the file carries customer phone and e-mail). Exports **every** ticket matching the chip, search and sort on screen, not only the page: the list and the route share `ticketSearchWhere` / `ticketListOrderBy` in `lib/ticket-list-filter.ts`. **.xlsx, not CSV**: Excel set to an Indonesian locale splits on ";", so a comma CSV opens as one column (the parts report's CSV has that problem), and a CSV cell starting with "=" runs as a formula. `lib/xlsx.ts` is a dependency-free one-sheet writer (inline strings, frozen bold header, autofilter, WIB date cells, `#,##0` for Rupiah, own zip + CRC32). 24 columns in `lib/ticket-export.ts`, labels not enum names, RMA stage beside the ticket status, bill total from selling prices with "Harga Lengkap" Ya/Belum. **No harga modal, no RMA vendor fields, no ticket notes.** Checked: 537 local tickets → 65 KB in 30 ms, read back with openpyxl (dates as dates, totals as numbers); against the dev server, admin 200 with the filtered file, technician redirected. 19 tests |
| X2 | **Alert: service finished, part still without an Accurate code** | ✅ | Owner: a ticket gets closed while a part fitted on it was recorded by name only (CA5), and nothing asked the technician to come back and pick the item actually used. Rule in `lib/part-code-alerts.ts`: service ticket, status `done` … `completed` (not while working — a late code is normal then; not cancelled/rejected — no bill), a part with `sku` null or empty. **Addressed to the technician holding the ticket** (owner, 2026-11-02 — the one who fitted the part picks its code): (1) a warning card on the **technician dashboard** listing only their own tickets (`technician_id`), and on the **admin dashboard** every ticket for oversight — oldest first, 8 rows + count, each linking to `#rincian-biaya`; (2) a banner at the top of the **technician and admin ticket pages**, with the link when the viewer may enter the code; (3) a **bell notification** to that technician when the ticket reaches `done` — from either portal, so an admin closing it still reminds the technician, not the admin (`lib/part-code-notify.ts`, never throws: the status is already saved). Cards and banner render nothing when nothing is missing and stay until the code is in. Checked on the dev server: DEMO-000005/6 (`done`, uncoded battery) flagged for admin and their technician, not for another technician; DEMO-000002 (`on_progress`) not flagged. 9 tests, 3 of them through the real status actions (`charges.test.ts`, whose cleanup now also removes the test technicians' `TechnicianPerformance` row — a `done` credits it, and the FK blocked deleting the user) |

### SPRINT 2026-11-04 — RMA desk asks: search by unit, export claims; production upload outage
Branch `feat/catalog-pcbuild-upgrade`. Not committed. No migration. ⚠️ This branch is **8 commits behind `origin/main`** (UI-3b + docker, `eeb568a`); `app/technician/tickets/[id]/page.tsx`, `components/service/ChargesPanel.tsx` and `CLAUDE.md` changed on both sides.

| # | Task | Status | Notes |
|---|------|--------|-------|
| X3 | **Klaim Garansi search reaches the unit** | ✅ | Admin RMA: "searchnya nama barangnya juga". `lib/rma/claim-list.ts` now holds the list's scope, chip and search (`claimSearchWhere`): ticket code, account name, customer name **+ device name, SKU, SN, RMA code, vendor name**, trimmed. An unknown chip is ignored instead of reaching Prisma as an invalid enum. "Clear" kept `q` in its link (it rebuilt the URL with the query) — now drops it and keeps chip and sort. Verified on MariaDB: `macbook`/`MACBOOK`, an SN, an RMA code and a vendor name each find their claim |
| X4 | **Export Excel on Klaim Garansi** | ✅ | `GET /rma/tickets/export`, RMA + Administrator (checked in the handler too). Same filter/search/sort as the list, every page. 33 columns in `lib/rma/claim-export.ts` — the case's whole path: ownership, unit, keluhan, technician's recommendation, handover, PIC, hold reason (label + note), vendor + LKL/ITR, supplier claim number, shipment, decision, replacement SN, dates, "Lama Proses (hari)" (handover → close, or → now while open). **Internal**: carries `vendor_rma_number`, `hold_reason`, `decision_notes` — never for customers. `RMA_DECISION_LABELS` moved to `lib/rma/decision.ts` (typed over the enum, + `rmaDecisionLabel` for grouped strings): the export imported it from `RmaStatusCard.tsx`, which drags React and lucide into a route — under the `react-server` condition it crashed on `createContext`. 18 local claims → read back with openpyxl. 13 tests |
| X5 | **Production upload outage, 2026-11-04** | 📝 diagnosed | Technicians on `ticketing.hnsitcenter.id` could not upload at all ("penyimpanan file sedang tidak bisa dihubungi"; the create form showed `R2_ENDPOINT must use https in production (got "http://127.0.0.1:9000")`). **Not file size** — the screenshot shows the photo compressed 3.7 MB → 122 KB first. The production environment has `R2_ENDPOINT` set to the local MinIO address (the value from a developer's `.env.local`); `lib/r2.ts` refuses a plaintext endpoint in production, so every upload fails. `.dockerignore` excludes `.env*`, so it is set in the hosting panel's environment, not the image. **Fix is configuration, no deploy:** empty `R2_ENDPOINT` there, check the other `R2_*` and `NEXT_PUBLIC_R2_PUBLIC_URL` are the real Cloudflare values, restart. Code side: `/api/upload-temp` passed `err.message` to the screen — now logs it and answers `storageFailedMessage("lampiran")`, like every other upload form. 3 tests |
| X11 | **Brand of the unit, from Accurate** | ✅ | RMA desk asked. `Ticket.device_brand` (migration `20261104090000_ticket_device_brand`, ⛔ `migrate deploy` first). Filled at intake when the unit is picked from the catalogue: Accurate's `brand` when set (laptops), else the last word of the category ("VGA CARD MSI" → MSI) — `lib/catalog/brand.ts`. Shown on the picked unit in the form, the RMA case page, beside the unit in Klaim Garansi; a "Brand" column in both Excel exports; searchable. Older tickets: `npm run backfill:device-brand` (dry run; `--apply`), re-reads each item by id |
| X12 | **"Unduh" really downloads** | ✅ | RMA desk asked. `<a download>` is ignored for another origin, so files on `attachment.hnsitcenter.com` opened in the tab. New `GET /api/files/download?url=&name=` (staff only) streams the object from storage with `Content-Disposition: attachment` — only URLs `storageKeyFromUrl` recognises, so it cannot fetch anything else. `FilePreview` uses it, and on the RMA case page every file gets a one-tap download button saved as "<RMA code> - <label>" |
| X13 | **Rafael's "Confirm Work Done" failed — config, not code** | 📝 | Reproduced on a phone viewport with production's code: the flow works; it fails only when the upload fails. Production `R2_BUCKET_NAME` was set to `hns-attachments` (the local MinIO bucket name from `docs/minio-local-storage.md`); the R2 bucket is `ticketing-hns` (checked read-only: the former 404, the latter exists). Also a stray `s` after the closing quote of `NEXT_PUBLIC_R2_PUBLIC_URL`. Fixed in Dokploy by the owner |
| X14 | **Photos and videos open in a pop-up** | ✅ | Owner asked, with a reference screenshot. `components/app/MediaGallery.tsx`: title, upload time, kind, "n dari N", previous/next (arrows, ← →, swipe), video plays inline, PDF in a frame, Unduh through `/api/files/download`. Server components keep their own thumbnails and wrap them in `GalleryTrigger`. Used for ticket Attachments and Proof Attachments (technician and admin pages) and the RMA case page, whose attachments became thumbnails with a one-tap Unduh each |
| X15 | **Analisa Klaim** | ✅ | RMA desk: which brands and kinds of goods come back. `/rma/analisa` (RMA + Administrator; sidebar under Laporan / Klaim & RMA): per brand, per kind (category with the brand taken off — "VGA CARD MSI" → VGA CARD), top items by SKU; each with approved / vendor-rejected / ineligible / still open and the approval rate over decided claims; WIB date range. `lib/rma/claim-analysis.ts`. Claims whose unit was typed are counted as "Tidak diketahui" and the page says how many — never guessed from the name (the BL28 fault) |
| X16 | **Rows per page: 10 / 25 / 50** | ✅ | Owner asked. `components/app/PageSizePicker.tsx` ("Tampilkan 10 25 50 per halaman"), links like `Pagination`, so the size sits in the URL as `?per=` and survives paging, sort links, filter chips, the search form (hidden input), the RMA Clear link and reload; works without JS. `parsePageSize` in `lib/pagination.ts` accepts only the offered sizes — `?per=99999` falls back to the list default, so one page cannot load the whole table. Changing size goes back to page 1. On: All Tickets, technician and Sales My Tickets, Klaim Garansi (default 10), Log Tiket (default 20 → **25**), Log Aktivitas (default 50). Hidden when the list fits in 10. Checked in Chromium at 1440 and 390 px: 10/25/50 rows, chip and Next keep `per`, no horizontal scroll. 4 tests |
| X17 | **PC Build from the quotation PDF: checklist, photos, coordinator alert** | ✅ | Owner asked, 2026-11-05. On Build PC step 3, upload the e-commerce "Quotation Rakitan PC" PDF → `POST /api/pc-build-quote` (staff only) reads it with **unpdf** (text layer + positions; `lib/pc-build-quote/parse.ts` is pure and tested on the real file's text, fixture in `__fixtures__`), refuses a non-quotation / scan / a quotation already on a live ticket (409), stores the PDF, and matches each SKU to Accurate by **exact** SKU. **Sales:** the PDF header's "Sales: …" line is read and matched to an active Sales account by name (`lib/pc-build-quote/sales.ts`: exact ignoring case/spacing, else one unique partial; ambiguous = none); it fills "Assign Sales" when none was picked (form and server), a hand-picked sales wins and the mismatch is shown, and the printed name is kept in `quote_sales_name`. The form shows a checklist like the e-commerce "Isi Paket" (`components/pc-build/QuoteChecklist.tsx`): every line must be ticked; "Ada yang tidak sesuai?" tells the person to have sales revise the quotation and re-upload (the new PDF replaces the list, with a diff note); "Foto Komponen Rakitan" (1–10 images) is required. `createTicketAction` **re-reads the stored PDF** (never trusts the browser's list), checks the tick count and photos, and records: `TicketPcBuildDetail.quote_code/url/customer/total`, `verified_at/by_id/by_name`; components with `quote_label` in quotation order (then any added by hand); attachments of kind `quotation` and `build_photo`. `first_build_url` stays empty for such tickets (it is the finished-build photo). Without a PDF the old manual flow is unchanged. **New ticket notifications, all ticket types** (`lib/new-ticket-notify.ts`): assigned → the technician (`assigned`); nobody assigned → the store's coordinators (`needs_assignment`, new enum value), else administrators; never the creator; never throws. Component card on admin/technician/sales ticket pages shows the quotation, who checked it and when. Migration `20261105090000_pc_build_quotation` — ⛔ VPS SQL first. 26 tests (10 parser, 4 sales matching, 12 through the real action); end-to-end in Chromium at 1280 and Pixel 7 with the real PDF |
| X18 | **Transfer number asked once; SN in Klaim Garansi** | ✅ | RMA desk, 2026-11-06, with a screenshot: "Vendor Memproses" on a store-stock case asked for the Nomor Pemindahan Stok entered at verification again. The rule (store stock → required on `verified` and `in_vendor_process`, so the `on_hold → in_vendor_process` bypass cannot skip it) only looked at the form, never at the case. `validateRmaTransition` now takes `recordedStockTransferNumber`; the server passes the case's own, the dialog shows "(sudah tercatat)" instead of the field. A case without one is still asked, on either path. Klaim Garansi list shows the unit's SN under its name. 2 tests; checked in Chromium |
| X19 | **Every PDF reviewed in a pop-up, drawn so phones show it** | ✅ | Owner, 2026-11-06: reviewing a PDF must not leave the page. New `components/app/PdfViewer.tsx` draws each page on a canvas with pdf.js (via unpdf, already a dependency), fetching the bytes through the staff-only `/api/files/download` so the storage domain needs no CORS — an `<iframe>` shows nothing on Android Chrome. Used by `MediaGallery` and `FilePreview` (RMA nota, etc.); their "Buka di tab baru" buttons removed (Unduh stays). The quotation's "Lihat PDF" (intake checklist and the ticket's Komponen PC card) now opens a pop-up. The Sales ticket page's attachment and proof lists, which linked to new tabs, now use the shared `AttachmentsCard` / `ProofAttachmentsCard` (pop-up gallery) like the technician and admin pages. Checked in Chromium at 1280 and Pixel 7: card, gallery and Sales page each drew both pages, no new tab opened |
| X20 | **Nothing typed twice** | 🔄 local, not pushed | Owner, 2026-11-06. Branch `feat/no-double-input`, no migration. Flow written for the team in `docs/alur-input-sekali.md`. (1) **A part is entered once, in Rincian Biaya**: the Part form gained notes and photos (`addPartChargeAction` uploads them before the row, images only, max 5), so the line is priced on the way in; the "Part yang Diganti" panel became a list with a **Tambah part** button that opens that form on Part (`openAddPartForm`, a window event). `addReplacedPartAction` is no longer called by the UI (kept for its tests). (2) Handover to RMA: the intake invoice (`kind = invoice`) is chosen already, shown with **Ganti**; Deskripsi Kerusakan starts from the intake complaint (`lib/plain-text.ts`, `notesToPlainText`). (3) RMA: a recorded resi / Nomor Tiket User is shown "(sudah tercatat)" on Vendor Memproses instead of asked; Ajukan ke Vendor after a hold and re-verification starts from the vendor, supplier claim number and resi already on the case (a vendor id only while still pickable); Nomor Tiket User can now be filled at Vendor Memproses. (4) PC Build: a customer name that differs from the quotation's is pointed out, with **Pakai nama dari quotation**. (5) **Check fee always billed** (owner, 2026-11-08): a service ticket that records the Rp 50.000 fee gets a "Diagnosa / Pengecekan" line on Rincian Biaya at creation (`lib/check-fee.ts`, linked to the Daftar Jasa job while active, 0 points), removable there; the invoice reminder now shows only for older tickets without the line. Duplicate claim photos: proposal **rejected** by the owner, both steps stay. 1214 tests + 6 new; checked in Chromium at 1280 and Pixel 7 on temporary local fixtures, deleted afterwards |
| X6 | **The owner's vendor list, with roles and contacts** | ✅ | 43 vendors, 2026-11-04. `prisma/data/vendors.ts` (was `claim-vendors.ts`) now carries each vendor's kind and contact. Kind → roles, **set exactly** (owner: a claim vendor is claims only): KLAIM GARANSI → `handles_claims`; SERVICE CENTER → `handles_claims` + `repairs`; Supplier part → `supplies_parts`; Service eksternal → `repairs`. A removed role only stops new picks — bills and cases already naming the vendor keep it (`readVendor` accepts the current id). Contact stored as given, a `62…` number as `+62…`; a blank one leaves what is recorded. `formerly` renames instead of duplicating: "Dova" → "DOVA (THERMALTAKE)". "AGRES JAKARTA" became two vendors on the list (KOMPONEN, MONITOR) and is **left as it was** — deactivate it from Daftar Vendor if unused. Same command as before: `npm run import:vendors` (dry run) / `-- --apply`. Applied locally: 4 new, 39 updated, rerun 43 unchanged. 13 tests. ⚠️ Not applied to staging/production — needs `20261027020000_vendor_location` there first |
| X7 | **Delete from every Data Master list** | ✅ | Owner asked. A trash button per row on Stores, Daftar Jasa and Vendor (`components/app/DeleteEntryButton.tsx`, ConfirmDialog, the server's refusal shown in the dialog). **Only an unused entry is deleted**: a store with tickets, a job on any bill line, a vendor on a bill line or an RMA case is refused with "nonaktifkan saja" — and the button is disabled up front with the reason as its title. New `deleteVendorAction`, `deleteServiceJobAction` (`deleteStoreAction` existed, only on the store page). Users get the existing **deactivate** flow in a list column instead (`components/users/DeactivateUserButton.tsx`, extracted from `EditUserForm`, which now uses it too): an account is never removed, its history must keep naming it. `DataTable` columns gained `interactive` — a cell holding its own buttons sits above a linked row's ::after and, on a phone, outside the card's link. The store cards stopped being one big `<Link>` for the same reason |
| X8 | **Log Aktivitas — who did what** | ✅ | Owner asked. `ActivityLog` table, migration `20261104060000_activity_log` (⛔ **`migrate deploy` before this reaches production**; the local DB's `migrate dev` wanted a reset because another worktree added `Ticket.public_short_code` to the shared local DB — the migration was hand-written instead, nothing reset). No foreign keys: the actor's name/role and the record's label are copied, so the row outlives both. Catalogue of actions in `lib/activity-catalog.ts` (typed — an unlisted name fails `tsc`), writer `lib/activity.ts` (`logActivity`, called **after** the action succeeded, **never throws**). Instrumented: password and SSO login, failed login (with the reason, never the password), logout; ticket create/status/assign/request/decision/notes/pickup/attachments/public chat/PC-build photos/delivery proof/delete; every Rincian Biaya write (the **cost price is never written to the log**); parts; RMA handover/transition/hold evidence; vendors, jobs, stores, store assignments; users, profile, password change, titles; access settings, targets, leave, shift swaps, leaderboard snapshot; the three exports. Chat messages are logged as "sent", without their text. `/admin/activity` (Administrator only, sidebar Laporan → Log Aktivitas): search, area, person, WIB date range, 50/page. Tests: the integration suites would leave hundreds of rows from accounts they delete, so `logActivity` is a no-op under `VITEST` unless `ACTIVITY_LOG_IN_TESTS=1`. Also fixed on the way: `uploadAttachmentsAction` had **no session check** (unused by the UI, but a server action is a public endpoint). 1141 tests; checked in Chrome — login and a vendor delete appear in the log |
| X9 | **Live search, and "nama barang" in every ticket search** | ✅ | Owner asked. Every list search box filters as you type (`components/app/LiveSearchInput.tsx`, 350 ms pause → `router.replace` with the form's own fields, page dropped; Enter/Search still submit the GET form, so no-JS still works). Used by `FilterBarSearch` (admin, technician, sales tickets; Klaim Garansi; users; Log Tiket; Log Aktivitas) and the RMA log. `ticketSearchWhere` (shared by admin, technician, sales lists and the export) now covers code, account name, customer name, unit name/SKU/SN and replaced parts' name/SKU; Log Tiket and the RMA log reach customer and unit too. Gotcha: Base UI's Input warns when `defaultValue` changes after mount, so the box keeps its first value and follows later ones through an effect (only when not focused) |
| X10 | **All Tickets: latest activity first, marked** | ✅ | Owner asked. Default sort is `updated_at desc` (`DEFAULT_TICKET_SORT`) — creating a ticket and every status change write it, so both rise to the top; "Date" became "Update terakhir" (relative, with the creation date under it). A green **Baru** (created in the last 24 h) or blue **Update** (status moved in the last 24 h, from the latest `TicketStatusLog`) pill beside the code, `lib/ticket-recency.ts`. Time-based, not per-viewer "unread" — that would need a table |

### SPRINT 2026-11-08 — warehouse visibility per role, ticket correction
Branch `fix/hide-warehouses`, cut from `main` `3e4fcb3`. **No migration** — both are new `AccessRule` capabilities, whose rows exist only where the owner changes a default.

| # | Task | Status | Notes |
|---|------|--------|-------|
| X21 | **Which warehouses each role sees** | ✅ | Owner: Griya and Gudang Batam are not for everyone; "cuman admin yang bisa lihat dan kasih aksesnya". Six capabilities in a new **Stok Gudang** section of Pengaturan Akses: Gudang Utama / Nagoyahill / Gateway (all staff), gudang klaim (Admin + RMA), **Gudang Batam (100) and Griya (350): Admin only**. `WAREHOUSE_ACCESS` in `lib/catalog/items.ts` maps each to its warehouse ids (restricted two also by name, checked first, so a renumbered or renamed row cannot slip into another setting); everything else is still dropped on arrival. `toCatalogItem(raw, visible)` and `searchCatalog` / `getCatalogItem` now **require** the viewer's set — `stockVisibilityFor(userId)` in `lib/access-server.ts`, or `NO_STOCK` where only a name/code is needed — so no caller can forget it. Applied to `/api/catalog/items` (what reaches browsers), the parts report and `ClaimStock` (hidden without `view_stock_klaim`). `stockTotal` sums only what the viewer may see. Note: before this, Griya and Batam reached nobody (not even Admin); every staff member did receive Gudang Utama and claim stock in the JSON |
| X22 | **"Ubah data tiket"** | ✅ | Owner: a wrong unit name on a ticket must be fixable, by Admin or a role he chooses. Capability `edit_ticket` (section **Tiket**, Admin only by default). Button on the admin, technician and sales ticket pages and on the RMA case page, shown only to holders. Dialog: unit (catalogue pick, re-read by id like at intake, or typed — typing over a picked unit drops its SKU link), SN, kelengkapan, kondisi, and customer name/phone/email/address where the ticket has its own customer (not `is_for_self`, not store stock). Intake's rules hold: unit name cannot be cleared, a claim needs its SN (and phone). Any status. Activity log `ticket.edit` writes every change **with the old value**. An untouched phone is sent back verbatim so saving another field never rewrites it. `lib/ticket-edit.ts` (pure, 13 tests), `app/actions/ticket-edit.ts`, `components/tickets/EditTicketButton.tsx`. Checked in Chromium on a Pixel 7: edit saved and logged, clearing the name refused, RMA without the setting sees no button and with it does |

### SPRINT 2026-11-09 — Kepala Toko (store supervisor) and its dashboard
Branch `feat/kepala-toko`, local only. ⛔ Two migrations to run on the VPS **before** this reaches `main`:
`20261109090000_store_supervisor_role` (Role enum + `StoreSupervisor`) and `20261109090100_store_supervisor_assignment`.

| # | Task | Status | Notes |
|---|------|--------|-------|
| KT1 | **Role `StoreSupervisor` ("Kepala Toko")** | ✅ local | Owner, 2026-11-09: one per store (Nagoya Hill, Gateway, more to come), **read only** — no assigning, no status changes. Portal `toko` (`/toko/dashboard`, `lib/routes.ts`), administrator also allowed and keeps the admin sidebar (Laporan → Dashboard Toko), like `/rma`. Audience `store_supervisor` in Pengaturan Akses (shop warehouses' stock by default, nothing else) |
| KT2 | **Which stores: `StoreSupervisorAssignment`** | ✅ local | Its own table, **not** `TechnicianStoreAssignment` — every "technicians of this store" query reads that one, and a supervisor in it would appear as a technician everywhere. Set on Data Master → Stores → store → "Kepala Toko" card; only an account with the role can be put there. A `?store=` for a store not theirs is ignored |
| KT3 | **Dashboard Toko** | ✅ local | Period chips (Hari ini / Minggu ini / Bulan ini) + date range, store picker when more than one. Stat cards; an **auto-advancing chart slider** (`components/toko/ChartSlider.tsx`: countdown + progress bar, 5/10/15/30 s per device in localStorage, ⏸, holds on hover/touch, swipe, ← →, dots, full-screen for a shop TV, `router.refresh()` every 5 min) with 7 charts: intake per day by type, pipeline now, finished per technician, working time per technician, working time per case category, lead time per category, and claims (brand + kind side by side, with approval rate; owner: claims only in the slider, no table further down); then the technician and category tables. **Rules shared with the rest of the app**: a ticket is finished at its first paid status (`EARNING_STATUS_LOG_FILTER`, claims at handover), working time from the time log with pauses out, measured only up to the finish. Case category = ticket type, service split by the replaced part (`TicketReplacedPart`) — `service_category` is null on every ticket and cannot be used. Per day = finished / scheduled days (work days − leave − shifts swapped away + swapped in); **no schedule → days with a finish ("hari aktif"), labelled**. Claims reuse `analyzeClaims`. Pure part `lib/store-dashboard.ts` (20 tests), queries `lib/store-dashboard-server.ts`. Checked in Chromium at 1440 and Pixel 7 on local data (Gateway, Aug–Oct): no horizontal scroll, slider advances, supervisor sent from `/admin` back to `/toko/dashboard`. Test account `spv.ngw@test.local` exists in the **local** DB only |
| KT5 | **Kepala toko gets pages, and the dashboard fits one screen** | ✅ local | Owner, 2026-11-10: the dashboard ran far down, and a supervisor with one page was not enough. Dashboard = header with the period filter beside it, four stat cards, the slider, and "Perlu perhatian" (3 longest-waiting tickets) beside it — exactly 900 px at 1440×900. The tables moved out. Read-only pages, all scoped by `requireStoreViewer` / `pickStores` (`lib/store-scope-server.ts`): **Tiket Toko** (`/toko/tickets`: search, status chips, technician and type filters, 10/25/50, Excel via `/toko/tickets/export`, filter shared in `lib/store-ticket-list.ts`), ticket detail (`/toko/tickets/[id]`: the technician page's sections without any control — no status, chat, pickup or WhatsApp; bill and parts read only; another store's ticket is a 404), **Klaim Garansi** (`/toko/klaim`: the RMA desk's list for the store, with its stage), **Kinerja Teknisi** (`/toko/teknisi`: the technician and category tables + this month's Target Teknisi progress), **Jadwal Teknisi** (`/toko/jadwal`: week grid of shift / leave / swaps, `lib/store-schedule.ts`). `RecencyCode` moved to `components/tickets/`; `StoreSupervisor` added to the file-download and SSO staff lists. Checked in Chromium at 1440 and Pixel 7: no horizontal page scroll, export 200 .xlsx |
| KT6 | **Perlu ditindaklanjuti** | ✅ local | Owner chose four of the proposed follow-ups, 2026-11-10. The dashboard's right column is one card with five rows — count, how many past their limit, the longest wait — each opening `/toko/tindak-lanjut?jenis=…` (sidebar Tiket → Tindak Lanjut): **stale** (waiting / on_progress, from intake; replaces "Perlu perhatian"), **pickup** (done / ready / waiting pickup, from entering that status, with an **Ingatkan** WhatsApp button — the ticket page's "Tunggu Diambil" wording, now one copy in `lib/whatsapp.ts`), **vendor** (external_service line sent and not returned), **billing** (service done…delivered whose bill has no line or a line without a selling price — the DRAF reasons of `lib/invoice.ts` a person can fix), **code** (`ticketsAwaitingPartCodeWhere`). Thresholds per kind in `lib/store-followups.ts` (yellow / red: 3/7, 7/14, 1/3 days). Local Gateway: 21 / 51 / 0 / 17 / 0 — the 51 "siap diambil" are probably mostly collected units whose status was never moved to Completed |
| KT4 | **Admin Stok (`StockAdmin`), read only** | ✅ local | Owner, 2026-11-10: watches PC builds and every part that goes out, with photos, **all stores**, and **changes nothing**. No check form, no "Masukkan kode", no notifications, no hold on any ticket: in the field the work stays with the technicians and the RMA desk for now. A physical-check flow (Admin Stok checks a build against its quotation before handover, holding the ticket until it passes, and notifying sales) was built, shown, and **taken out on the owner's word**; it is the intended next step, not today's. Portal `/stok` (an administrator keeps their sidebar: Laporan → Dashboard Stok / Rakitan PC / Part Keluar). **Rakitan PC** (`/stok/rakitan`): every PC build not cancelled or rejected, by stage (sedang dirakit / selesai, belum diserahkan / sudah diserahkan, `buildStageOf` in `lib/stock.ts`, exhaustive), with quotation, intake tick by whom, photos (intake component photos + finished build), days in the current status. **Part Keluar** (`/stok/part`, `lib/stock-server.ts`): one list from service replaced parts, upgrade items and PC build components; period / store / kind / search / "tanpa kode"; photos in the pop-up gallery; Excel export. **Dashboard**: one screen. Ticket pages are read only: the kepala toko's view became `components/tickets/ReadOnlyTicketView.tsx`, shared with `/stok/tickets/[id]`. Migration `20261110090000_stock_admin_role` (the Role enum only), ⛔ VPS SQL first. Local test account `stok@test.local` and ticket TEST-STOK-001 exist in the **local** DB only |
| KT7 | **Kepala toko: Daftar User** | ✅ local | Owner, 2026-11-10. `/toko/tim` (sidebar Tim → Daftar User): the technicians assigned to the viewer's stores (coordinator / head technician marked) and the stores' kepala toko, with phone (opens WhatsApp) and e-mail, weekly pattern, **today** (`scheduleCell`: masuk / cuti / digantikan / libur / belum diatur) and tickets held now (waiting / on_progress). Read only |
| FN1 | **Finance (`Finance`): vendor speed on store-stock claims** | ✅ local | Owner, 2026-11-10: which vendors are slow with the shop's own claimed stock, so payment terms can be weighed. Read only, every store; portal `/finance` (an administrator keeps their sidebar: Laporan → Vendor Klaim (Finance)). A store-stock claim = `warranty_claim` with `RmaCase.unit_ownership = store_stock`, or with no case yet and the intake's `TicketWarrantyDetail.unit_ownership = store_stock` (`STORE_STOCK_CLAIM_WHERE`). **Time at the vendor** runs from `submitted_at` to `unit_received_at`, else `closed_at`, else today (`lib/finance-claims.ts`, pure, 6 tests); 14 days amber, 30 red. **Kinerja Vendor** (`/finance/dashboard`): claims sent in the period (default 12 months), per vendor slowest first: sent, still there (and past 14 days), longest still open, median / average to come back, median to the decision, approved / rejected; vendor location LKL/ITR from the vendor list; vendors without an id are joined on the name ignoring case and spacing. **Klaim Stok Toko** (`/finance/klaim`): period = claim opened, so claims not sent yet are listed too; vendor / store / search / stage chips (masih di vendor / belum dikirim / sudah kembali); 25 per page; Excel export with stock origin, transfer number, supplier claim number and dates. `/finance/tickets/[id]` opens store-stock claims only (anything else 404). Migration `20261110100000_finance_role`, ⛔ VPS SQL first. Local test account `finance@test.local` and claims TEST-FIN-001..004 exist in the **local** DB only |
| FN2 | **Finance: money held in claims, at harga modal** | ✅ local | Owner, 2026-11-11: show what each claimed unit cost, so the money stuck at a vendor is visible — from the product's harga modal. Accurate's HPP via the data API: `catalogCostAccess()` reads `/status` scopes, `getCatalogItemCost(id)` reads `data.cost` (server only, never on a `CatalogItem`). ⚠️ **Client "Ticketing HNS" still has `cost: false`** (checked 2026-11-11) — until the owner enables it in Data Accurate → Pengaturan → API & Integrasi the pages show only a notice (with how many units already carry an Accurate code) and hide the money column, card and summary; nothing to deploy when it is turned on. Valued one unit per claim at the unit's catalogue item (`Ticket.device_catalog_item_id`); a unit typed by hand has no price and is counted apart ("tanpa harga modal"), never as 0 (`heldMoney` in `lib/finance-claims.ts`, 2 tests). Held = not back: at the vendor or not sent yet. Kinerja Vendor: "Uang tertahan di vendor" card + per-vendor column; Klaim Stok Toko: "Harga modal" column and a held summary (total / di vendor / belum dikirim); Excel gains "Harga Modal / Unit (HPP)" and "Uang Tertahan". Behind `view_cost`, whose defaults now include Finance. Current HPP, not the HPP on the day of the claim. Checked in Chromium with a simulated HPP in the test copy only (reverted) |
| RM1 | **Klaim Garansi: Klaim User / Klaim Toko filter** | ✅ local | RMA desk, 2026-11-11. Dropdowns "Milik unit" (with counts) and "Status" on `/rma/tickets`, applied on pick (`components/app/AutoSubmitSelect.tsx`; they replaced both chip rows, owner 2026-11-11) (`?owner=customer|store_stock`), kept through search, Clear, sort, paging and the Excel export; "Stok toko" pill on store-stock rows. Ownership from the case, else the intake; a claim with neither is the customer's (the intake could only open customer claims before 2026-10-08). `claimOwnerWhere` in `lib/rma/claim-list.ts`, 3 tests. Local: 16 + 6 = 22. NGW-000373 ("STOK TOKO GATEWAY", no ownership recorded) counts as Klaim User — an old invented-name claim, still `on_progress`; it moves to Klaim Toko once the handover to RMA records store stock |

## 📋 BACKLOG — what is likely to come next

Ordered roughly by how much is already decided.

### Asked by the owner 2026-10-26

| # | Item | Where |
|---|------|-------|
| BL37 | 🔄 **Customer self-service requests + "service eksternal".** Customer with an **e-commerce account** submits a request from `hnsitcenter.id`'s profile page; staff schedule the arrival (drop-off or technician on-site) and the request becomes a ticket when the unit is handled. Design only, waiting on the owner's decisions (§9 of the plan). Key constraints found: HNS SSO is workforce-only and forbids customers; ticketing has no customer portal; `ecommerce-hns` already owns customer accounts — so e-commerce hosts the form and calls a server-to-server ticketing API. A request is **not** a ticket (no code, no KPI until the unit is in hand) | `docs/plan-pengajuan-servis.md` |
| BL38 | ⬜ **PC Build components and Upgrade items from the Accurate catalogue.** Today PC Build components are free-text tags (`TicketPcBuildComponent.component_name`) and upgrades come from the internal `Upgrade` table. Owner chose both. Needs a migration, so it ships after the release of W4 | `CreateTicketForm.tsx`, `components/catalog/` |
| BL39 | ⏸ **Held by the owner 2026-11-05 — video limits and "Langkah Penanganan".** Owner will brief the technicians first. **Video:** today uploads are not compressed and capped at 9 MB per submission (Next body limit), i.e. ~5–15 s of 1080p phone video (40–130 MB/min). Proposal: max **60 s**, min **3 s** per video, checked in the browser from the file's duration; for a full minute uncompressed, upload straight from the phone to R2 with presigned URLs (BL36, ~150 MB cap, progress bar) — needs a CORS rule on bucket `ticketing-hns`. **Langkah Penanganan:** a numbered list of attempts on a ticket — what was tried, result (berhasil / belum berhasil), note, photos/videos — with "+ Tambah langkah berikutnya", so RMA and vendors see every mitigation in order. Open decisions: which ticket types (proposed service + warranty claim, carried into the RMA handover); action picked from a list + note vs free text (proposed list — countable); at least one step required before `done`?; shown on the customer page or internal only | `lib/upload-limit.ts`, BL36 |

### Asked by the owner 2026-10-03 — mockup made, waiting on approval

| # | Item | Where |
|---|------|-------|
| BL28 | 🔄 **The RMA activity log is unreadable, and it needs a PDF export.** Three parts, one request. **(a) ✅ DONE 2026-10-03** — `/rma/logs` rebuilt, 672 tests (was 638), `tsc` + lint clean, production build passes, every view and filter exercised against the running server with a signed RMA session. Two views: grouped per case (`<details>`, so a case opens with **no client JS at all**) and a columned chronological table split by day. New `lib/rma/log-grouping.ts` (pure, clock passed in) and `lib/rma/logs.ts` (loading, one clock read per request — the `queue.ts` rule). Decisions worth keeping: the grouped view pages by **case**, not by event, because paging by event would cut a timeline across a page break and reintroduce the exact fault; and in that view the filter selects *cases* while the full timeline is still shown, with "Filter cocok pada N dari M kejadian" said out loud. Four faults fixed on the way: the date filter built midnight **where the server runs**, not in Batam (a UTC host silently returned 07:00-to-07:00); `ineligible` was missing from the stage filter, so a case the desk turned down could not be found by stage; `?page=` past the end said "Belum ada aktivitas RMA" over a full log, with the pagination strip hidden so there was no way back; and "cocok dengan filter" was shown for input the query had dropped, so an unparseable date labelled the complete list as filtered. Also added: search now reaches the customer name and the note text, and the gap between steps ("+21 menit") is displayed — the old page threw it away, so three transitions seconds apart read the same as three a week apart. Original note: `/rma/logs` rendered every `RmaEvent` as one flat chronological list, so a case's story is scattered across the page — measured on the local database: **24 events across 9 cases, and the newest 25 events interleave all nine**; `RMA-NGH-2610-0001` has two events and they are separated by two events of other cases. Proposal: group by case (collapsible, with a per-case timeline and the gap between steps) plus a second "Kronologis" view that is a real aligned table instead of prose rows. (b) **Export PDF** at two levels: one per case (a signed "Laporan Penanganan Klaim Garansi" with the full `RmaEvent` history) and one per filter period (a rekap with the headline numbers, the case table, and the chronological log). Mechanism follows `app/admin/performance/ExportToPDF.tsx` — a print window, no `jspdf` dependency. ⚠️ Both PDFs are **internal**: they carry `vendor_rma_number`, `hold_reason`, `decision_notes` and `RmaEvent.note`, the fields the public page is forbidden to render. A customer-facing variant would be a second template built on `lib/rma/public-status.ts`. (c) **The dashboard cannot be read without explanation.** Owner's decision 2026-10-03: **rebuild the dashboard rather than document it.** New structure groups by *whose ball it is* — desk / vendor / technician — and every threshold from `RMA_STAGE_SLA` is printed inline on its stage, because that table decides every colour, count and sort order and has never been on screen. Two findings fell out of designing it: **`NEEDS_ACTION` in `queue.ts` is wrong** — it is `["pending_verification","on_hold"]`, so `verified` (2 cases, both already amber) is desk-owned work that the "Butuh Tindakan" card does not count, and the SLA table's own comments treat `verified`, `vendor_decided` and `unit_received` as desk stages; the honest figure is 7, not 5. And ticket `NGW-000043` has sat in the pre-handover list **95 days**, which no current screen surfaces. ⛔ The "Selesai Bulan Ini / tumpukan +N" band is **dropped on the owner's instruction** — `openedThisMonth`, `netThisMonth` and `closedThisMonth` lose their only reader; `resolution` was moved into a collapsed long-term statistics section rather than deleted. ⛔ **"Klaim per Merek" and "Klaim per Tipe Perangkat" dropped too** — the owner called it on 2026-10-03 and the data agrees. Across all 18 claims: the brand is the first word of free-text `device_name`, giving **12 "brands" from 17 names, only three of them real manufacturers** (ASUS, Lenovo, Axioo); `Tuf` and `ROG` count as separate brands although both are ASUS, so ASUS is really 7 and not 5, and `Pc` and `samrt` are not brands at all. Device type is worse: `device_type` is never chosen, it is **derived** in `CreateTicketForm.tsx:168-176` from a four-way grid where `Laptop` always becomes `Laptop_Office` — which is the whole reason 12 of 18 read `Laptop_Office`, and two rows are provably wrong (`"Pc benzzera hitam"` filed as `Laptop_Office`, `"AXIOO"` as `Printer`). Both charts measure how the form is filled in, not what is being claimed. Removing them makes **`lib/rma/device.ts` unused in its entirety** (`queue.ts` is its only importer) along with `claimTickets`, `brands`, `deviceTypes` and `totalClaims` in `queue.ts` — decide whether to delete the module and its tests or park them until intake captures brand and category from a list rather than a text box (same shape as BL20). Also wants a date **range** in the log filter (today it is a single day), which the period PDF needs anyway. ✅ Sidebar order already applied (not committed): Dashboard → All Tickets → Create Ticket → Log Aktivitas | Mockup: artifact "Mockup Log RMA + Export PDF" (6 artboards). Log + PDF approved 2026-10-03 |

| BL30 | ✅ **DONE 2026-10-03 — permanent ticket deletion, Administrator only.** The owner was shown the three costs and chose a hard delete over a soft one, so the code makes the cost visible and recorded rather than preventing it. New `DeletedTicketLog` model (migration `20261003044818_add_deleted_ticket_log`) holds **no foreign key to Ticket** on purpose, so it outlives the thirteen cascading relations — without it nothing could answer "what happened to NGW-000123?" afterwards. The stored `TechnicianPerformance` counters are reversed by the same `lib/kpi.ts` rule that granted them, counted **from the status log and not from the ticket's current status** (a warranty claim is paid at `rma_process` and then moves on to `done`), and clamped at zero so a counter already drifting under BL25 is never driven negative. Attachment files are removed from storage afterwards, best effort and outside the transaction, with the URLs kept in the snapshot so an orphan in the bucket stays traceable. The dialog prints what will be destroyed before asking, and requires the ticket code typed out — checked on the server too, because a confirmation only the browser enforces is not one. 18 tests | `app/actions/admin.ts`, `app/admin/tickets/[id]/DeleteTicketPanel.tsx`, `lib/r2.ts` |
| BL34 | ⚠️ **Deleting a ticket frees its code, and the next ticket takes it.** Seen in real use within 82 seconds: the owner deleted `NGH-000153` (a `warranty_claim` at `rma_process`) at 03:30:11 on 2026-10-05, and the ticket created at 03:31:33 was issued **the same code** — because `createTicketAction` allocates from the highest code that still exists, and the deleted one had been the highest. So `DeletedTicketLog` now holds a row saying NGH-000153 was destroyed while a live, unrelated NGH-000153 (type `service`) sits beside it. Traceable only because the snapshot carries `ticket_id`; by code alone the audit trail is ambiguous. Not fixed, because the options are real choices: never reuse a freed code (needs a per-store counter row, the same change BL19 wants), or print the deleted ticket's id beside its code wherever the log is read. Found 2026-10-05 | `app/actions/tickets.ts`, `app/actions/admin.ts` |
| BL33 | ✅ **DONE 2026-10-05 — the damage video was unwatchable, for two separate reasons.** Measured on a real handover, `rma-damage_NGH-000153_1.webm`: 1920×1080, 31.8 s, **878 KB — 221 kbps and 4.8 frames per second** (153 frames where ~950 belong). The WebM header says `MuxingApp: Chrome`, so it is the browser's own transcode output, not what the technician filmed. Two causes, both in `compressVideo`. **(1)** The `<video>` element was created with `document.createElement` and **never attached to the document**, so nothing composited it and `captureStream()` had almost no frames to take — it is now appended as a 2px, `opacity: 0.01` box, because `display: none` and `visibility: hidden` stop painting too. **(2)** `new MediaRecorder(stream, { mimeType })` named **no bitrate at all**, so the encoder chose 221 kbps for 1080p. New pure `targetVideoBitrate(duration)` spends the upload budget instead of guessing — 15 MB of the 20 MB `serverActions.bodySizeLimit`, clamped to 1.2–6 Mbps, with a fallback for when `video.duration` is NaN. For the clip above that is **over 3 Mbps, more than fifteen times what it got**. 7 tests | `lib/compress.ts` |
| BL31 | ✅ **DONE 2026-10-05 — replaced parts on a service ticket.** Asked twice by the owner; built on the second ask. New `ServicePart` enum (lcd, battery, keyboard, charger, ram, storage, motherboard, fan, speaker, casing, other) and `TicketReplacedPart` model, migration `20261005034809_add_ticket_replaced_part`. **The category is a picker and the item name is free text beside it, never instead of it** — that split is the whole point, and the reason is written into the schema: `device_name` and `vendor_name` are free text and both splintered, which is what forced the dashboard's brand chart to be withdrawn (BL28). A category can be counted; prose cannot. `lib/service-parts.ts` holds the labels in one exhaustive switch, so a part added to the schema without a label fails `tsc` rather than rendering the raw enum name the way "rma process" once did on a customer's page. Guards: service tickets only, only the technician holding the ticket may add, only the person who recorded it may remove, and `other` is the one category that demands an item name because it says nothing by itself. Technician panel edits; the admin ticket page shows it read-only. **Deliberately not on the public customer page** — that is a separate decision. **Photos added the same day** on the owner's note that technicians already photograph the box and the label: `TicketReplacedPartPhoto` (migration `20261005035624_add_replaced_part_photos`) hangs off the part and not off the ticket, because a ticket-level attachment cannot say which of three replaced components it pictures. Images only, five per part, uploaded before the row is written so a failed upload leaves nothing behind — the `handoverToRmaAction` pattern — and the files are deleted from the bucket when the part is removed, since the cascade only takes the rows. Optional by design: not every swap has a box. 31 tests | `lib/service-parts.ts`, `app/actions/technician.ts`, `app/technician/tickets/[id]/ReplacedPartsPanel.tsx` |
| ~~BL31-held~~ | ⬜ ~~**HELD by the owner 2026-10-03 — replaced parts on a service ticket.**~~ Which part was changed (LCD, battery, keyboard, …) plus a free input for the item name, with the service type reading as e.g. "ganti baterai". Notifications for it come later. **Explicitly held**: the owner wants it designed properly and discussed with the technicians first, so no code has been written. When it is taken up, note that it is the same catalog-versus-free-text shape as BL1, BL17 and BL20 — a part picked from a list is countable, a part typed as prose is not, which is exactly why the brand and device-type charts had to be dropped from the dashboard (BL28) | not started |
| BL32 | ⬜ **"Kasir" — the owner asked back what it would mean.** Nothing in the schema models money: no price, no amount, no payment method, no invoice entity. Only `Ticket.payment_proof_url`, a file URL. So a cashier is not a role toggle but a payment domain that does not exist yet. Needs a decision before anything is scoped | not started |
| BL35 | ⬜ **Apply the 2026-10-14 QC fixes.** Batch 1 (status/points integrity: double-submit writes two `done` logs, cancel from any status, Sales can move any ticket anywhere, admin crash on a missing performance row) is the one affecting figures daily; batch 2 is access (sessions never re-checked against `is_active`/role, coordinator cross-store assign, any user as technician). Production data may already carry duplicates — check before fixing | `docs/qc-run-2026-10-14.md` |
| BL36 | ⬜ **Videos over 9 MB.** Needs direct browser-to-R2 upload with presigned URLs, bypassing Next's body limit entirely; requires a CORS rule on the R2 bucket (owner's Cloudflare dashboard) | `lib/upload-limit.ts` |

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
| BL8 | **Sales redirect 404s** — `ticketHrefForPortal("sales")` points at `/customer/...`. Wants its own branch off `origin/main`. **Sharpened by QC 2026-10-03:** the customer portal has **no `page.tsx` at all** (`app/customer/` holds only two orphaned components nothing imports), so this is not a broken link into a working portal — the destination does not exist. The target must be `/sales/tickets/{id}`, which does exist and answers 200 for a Sales session | `lib/routes.ts` |
| BL29 | ⚠️ **`/customer/*` is guarded by nobody.** `PORTAL_ROUTES` has no `/customer` entry, so `canEnter` returns true for **every** authenticated role — Technician, Sales, RMA alike. Dormant only because `app/customer/` contains no page, so every such path 404s; the first page added under it is readable by all roles. Same shape as BL6: a defect that activates on the first new caller. The fix is one line in `PORTAL_ROUTES`, but *who* may enter is a decision — the Customer role itself can no longer log in, so the honest options are "nobody" (delete the folder and its two orphans) or "Administrator only". Found by the role × route matrix in `docs/qc-run-2026-10-03.md` § 5 | `lib/routes.ts` |
| BL9 | **Average-duration report** misses claims sitting at `rma_process`. It measures elapsed work time rather than credit, so it was left alone | `app/admin/performance/page.tsx` |
| BL10 | Residual: both claim guards key on `waiting`/`on_progress`. A real transition table closes this without special-casing claims | `docs/issue-transition-guard.md` |

### Deployment and infrastructure

| # | Item |
|---|------|
| BL11 | ⚠️ **Superseded.** The branch is pushed and the database is MariaDB, not Supabase, so the enum warning no longer applies. What remains is the **cutover**: `docs/cutover-runbook.md`. Original note: it will crash against Supabase until `RmaCase`, `RmaEvent` and the new enum values exist there — several pages already `select: { rma_case: ... }`. Steps in `docs/rma-deploy.md`. Postgres enum values **cannot be removed**, so `ineligible` is permanent once applied |
| BL12 | **RLS not enabled** on any table, now including `RmaCase` and `RmaEvent` |
| BL13 | **Demo data** NGW-000004..NGW-000009 still in the local database |
| BL14 | Production TLS: `rejectUnauthorized: false` in `lib/db.ts` is interim; the target is Supabase's CA bundle |
| BL27 | **A cancelled ticket's working time never stops growing.** Cancelling writes no closing event — the log only ever holds `START`, `PAUSE`, `RESUME`, `DONE` — so the open interval is still measured against the clock. One ticket already displays **2457h** (~102 days), and the figure rises on every page load. 6 tickets affected. `isDone` does include `cancelled`, so it does not tick on screen and is labelled "Total Working Time", which makes it read as a settled fact rather than a bug. Two fixes: write a closing event on cancellation and backfill the six from `TicketStatusLog` (correct, touches data), or stop counting a dangling interval once the ticket is closed (one line, no data touched, but a ticket holding only a `START` would then show `0s`). **Recommended: the first** — the second trades one wrong number for another. Needs a decision; found 2026-10-02 |
| ~~BL26~~ | ✅ **DONE 2026-10-05 — production is baselined.** The verification gate was run first and came back clean: one `ALTER TABLE UserTitle ALTER COLUMN emoji DROP DEFAULT`, three `CREATE TABLE`, four foreign keys, and **nothing else** — so production's 25 baseline tables matched the repo exactly and `migrate resolve` hid no drift. Then `migrate deploy` applied four migrations and `migrate status` answered "Database schema is up to date!". **From now on a schema change is just `prisma migrate deploy` before the code ships** — the hand-typed ALTERs that caused the 2026-10-02 outage are over. Original note kept for its reasoning: the repo had `prisma/migrations/` and the local database was on it, but production was not, so `prisma migrate deploy` there would have tried to create 25 tables that already existed |
| ~~BL15~~ | ✅ **DONE** — see sprint 2026-09-28. Original note kept for its reasoning: inventoried 2026-09-27 in `docs/plan-mariadb-port.md`. Bigger than the one-line note suggested: `extra_services String[]` is a scalar list, which Prisma supports on PostgreSQL only, so it fails `prisma validate` and forces a schema change plus data migration. Supabase Realtime dies entirely. 15 `mode: "insensitive"` usages must be dropped (MySQL collation is already case-insensitive). Plus the advisory lock, PascalCase table names, and 477 tests that currently run on Postgres |

### Worth doing, nobody has asked yet

| # | Item |
|---|------|
| BL16 | **jsdom and React Testing Library.** `create-form.test.ts` reads the file as text because the project cannot render a component in a test. That guard exists because the claim flow broke three times by confirming a form renders instead of confirming the flow completes |
| ~~BL17~~ | ✅ **DONE 2026-10-19 — W4-V.** Claim vendors live in `Vendor` with `handles_claims`, cases link by `vendor_id`, existing names were backfilled. Original note: the folding in `lib/rma/vendor.ts` stops the splitting getting worse; it does not clean up what is already there, and vendors still cannot be managed from the UI |
| BL18 | `extra_services` earns nothing anywhere. Two badges used to imply otherwise. Whether extras should earn is one line in `lib/points.ts` — and an unanswered question |
| BL19 | **RMA code allocation is retry-based, not serialised.** `pg_advisory_xact_lock` was transaction-scoped and had no MariaDB equivalent — `GET_LOCK()` is connection-scoped, so it cannot be held to commit without leaking on an error path. `allocateRmaCode` now absorbs contention through `MAX_ALLOCATION_ATTEMPTS = 10`: with N simultaneous handovers at one store the Nth needs its Nth attempt, and exhausting the budget returns "please try again" rather than a duplicate, because the unique index is the real guarantee. The deterministic fix is a per-prefix counter row whose InnoDB lock is held to commit and rolls back cleanly — a schema change, deliberately kept out of the port. **Unblocked 2026-10-02**: there is a migration history now |
| ~~BL21~~ | ✅ **DONE 2026-10-01** (`ca44816`), and the fix went further than the note: resolving by ticket code was also enumerable. Original note: ⛔ **The public share page is unreachable by the people it is for** — two independent faults, both pre-existing, found while testing the standalone build. (a) `proxy.ts` allows `/ticket*` but the page lives at `/[date]/[ticketCode]`, so `/2026-09-28/NGW-000001` redirects an anonymous visitor to `/login` (verified: 307 → /login). (b) `PublicShareButton` copies `/ticket/${shareToken}`, which passes the proxy but resolves against `findUnique({ ticket_code })` — a share token is not a ticket code, so the copied link finds nothing. `PUBLIC_ROUTES` in `proxy.ts` is declared and never read, the same dead-constant shape as `STATUS_STEPS`. Also worth noting: `date` is not used in the lookup, so it adds no secrecy. This makes the whole public-status work from the 2026-09-24 sprint invisible in production. **Own branch off `origin/main`** — unrelated to the MariaDB port |
| BL20 | **`extra_services` should be a catalog table, not a Json column.** The six services and their points are hardcoded in `ExtraPointsPanel.tsx`, which is why a third point table exists (2/3/1/1/3/2 there, +3 flat on the list badges, 0 in `lib/points.ts`). `Upgrade` + `TicketUpgradeDetail` already model exactly this correctly. End state: `ExtraService` + `TicketExtraServiceDetail` with `@@unique([ticket_id, extra_service_id])`. Held back from the MariaDB port on purpose: a platform move and a redesign in one change make a failing test impossible to attribute. Related: `TicketUpgradeDetail` has **no** `@@unique`, so the same upgrade can be attached twice and counted twice |
| BL22 | **`getFileType()` calls everything that is not an image or a video a `pdf`.** A `.txt` uploaded through `/api/upload-temp` is stored as `file_type: pdf` and renders with a PDF icon. Fixing it means a fourth value on the `FileType` enum. **Unblocked 2026-10-02** — the baseline migration exists, so this is now an ordinary `prisma migrate dev` plus a backfill decision for rows already stored as `pdf`. Found 2026-10-01 |
| BL23 | **Image validation trusts the client's MIME type.** `f.type.startsWith("image/")` in `app/actions/rma.ts` (three places) is whatever the browser claimed; the bytes are never sniffed. Tightening it needs a decision first — HEIC from iOS has already caused trouble in this form, and content sniffing will reject some legitimate files |
| BL24 | **The date segment of a public ticket URL is not validated.** `/2020-01-01/{token}` opens the page; only the token resolves it. Harmless today, but the segment reads as if it matters. Three options, all needing a decision: validate it (links already sent by WhatsApp with a mismatched date stop working), leave it decorative, or drop it from the route |
| BL25 | **Stored `TechnicianPerformance` disagrees with a recomputation from the log** for 9 of 14 technicians (Rianto −8, Mitchel −9, Steaven −11, Raffi −15 …). The direction is consistent with history credited under the older point tables, so it is probably explanation rather than corruption — but it has not been traced, and recomputing would move leaderboard figures people have already seen. Measured 2026-10-01 |

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
- **Styling convention:** Existing components use vanilla CSS classes (`.card`, `.btn`, `.form-input`). New and migrated UI uses shadcn (`components/ui`) + the domain components in `components/app` + Tailwind — see sprint UI-1. A page is migrated one at a time; a vanilla class leaves `globals.css` only once grep shows no user left
- **Tailwind padding/margin only work inside `[data-slot]`.** The legacy reset in `globals.css` is unlayered and beats every Tailwind utility, so `p-*`/`m-*` are dead on legacy markup — but since UI-1 it skips any element that has `data-slot` or sits inside one. Every shadcn and `components/app` component carries `data-slot`; a migrated page puts one on its root (`<main data-slot="…">`, as `/dev/ui` does) and Tailwind works throughout. Do not move the reset into `@layer base` on its own: 186 dead classes in 30 legacy files would come alive at once
- **Status badges:** `<StatusBadge kind status />` from `components/app`, label and tone from `lib/status-display.ts` (exhaustive, `never`). Takes `ticketBadgeChoice()`'s result directly. Do not add another status → label map
- **Logo:** Always use plain `<img src="/logo-hns.jpg">` — NOT Next.js `<Image>` component (causes hydration issues in sidebar/auth pages)
- **`session.ts`** has `import "server-only"` — never import it from client components
- **Stat cards:** Use `.stat-card > .stat-card-icon + .stat-card-body > (.stat-card-value + .stat-card-label)` — vertical column layout
- **Leaderboard data:** Comes from `TicketStatusLog`, NOT from the `Leaderboard` snapshot table (which is legacy). Filter with `EARNING_STATUS_LOG_FILTER` from `lib/kpi.ts`, never with a bare `new_status: "done"` — that credits a warranty claim twice
- **Point system:** `lib/points.ts` is what gets CREDITED; the leaderboard, the badges and `admin.ts` still carry three other tables that disagree (see `FLOW.md` § 4, branch `fix/points-table-unification`). Import from `lib/points.ts` for anything new — do not add a fifth. Not stored on `Ticket`
- **KPI rule:** One copy, `lib/kpi.ts`. `performanceEffect(type, status)` decides success / failure / ignore for `TechnicianPerformance`; `EARNING_STATUS_LOG_FILTER` is the same rule as a Prisma filter
- **Role → route:** One copy, `lib/routes.ts`. Exhaustive `switch` over `Role` with `const _exhaustive: never`, so a new role without a destination fails `tsc` instead of silently falling through to `/login` — which is what the redirect loop was. Used by `proxy.ts`, `app/actions/auth.ts`, `app/page.tsx`, `NotificationBell.tsx`
- **Public page secrecy:** `/{date}/{ticketCode}` must never render `vendor_rma_number`, `hold_reason`, `decision_notes`, `stock_origin`, `stock_transfer_number`, `customer_ticket_number` or `RmaEvent.note`. It selects RMA fields one by one; keep it that way
- **Local uploads:** two options, neither needing R2 credentials. `R2_ENDPOINT=http://127.0.0.1:9000` points the real S3 client at local MinIO and exercises the same code path as production — preferred; see `docs/minio-local-storage.md`. `STORAGE_DRIVER=local` writes to `public/uploads` instead, which is simpler but skips the S3 code entirely, so nothing in that path is tested. Without either, every upload fails with a TLS error locally
- **Tailwind padding and margin on legacy markup.** Outside `[data-slot]` (see the rule above) `p-4`, `px-2`, `m-2` are still silently dead while `gap-*`, `text-*`, `rounded-*` and colours work — in legacy code put padding and margin in `style={{ }}`; in new code, build from `components/app` / shadcn, or put `data-slot` on the root. This is the "Tailwind v4 bug" sprint T4 worked around
- **Phone numbers:** Always stored as `+62XXXXXXXXX` format. The `+62` prefix widget is used in `CreateTicketForm` and `register/page.tsx`
- **Notification bell:** Uses `position: fixed` (not `absolute`) to prevent mobile overflow
- **Component Spacing & Padding:** Always provide appropriate gaps and paddings depending on the components. If elements belong tightly together, use a small gap (e.g., `gap-2`). If separating distinct sections or larger components, use a wider gap (e.g., `gap-4` or `gap-6`). **ALWAYS remember to add padding** inside components (e.g. `p-4`, `p-5`, or `px-6 py-4`) based on the component's visual needs. Never leave components without adequate internal padding.

