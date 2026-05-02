@AGENTS.md

# TechServe — Role-Based Ticketing System: Project Handoff

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
| Styling       | Vanilla CSS (`app/globals.css`) — NO Tailwind classes used        |
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
│   │   ├── technician.ts     # takeTicketAction, updateTicketStatusAction
│   │   └── tickets.ts        # createTicketAction, sendMessageAction,
│   │                         # markMessagesReadAction, uploadAttachmentsAction
│   ├── admin/
│   │   ├── dashboard/page.tsx
│   │   ├── tickets/
│   │   │   ├── page.tsx               # All-tickets list with search/filter
│   │   │   └── [id]/
│   │   │       ├── page.tsx           # Full ticket detail
│   │   │       ├── AdminAssignPanel.tsx   # Technician/Sales assignment dropdowns
│   │   │       └── AdminStatusPanel.tsx   # Approve/Reject/Done/Cancel buttons
│   │   ├── users/
│   │   │   ├── page.tsx               # User list with role filter
│   │   │   ├── create/
│   │   │   │   ├── page.tsx
│   │   │   │   └── CreateUserForm.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── EditUserForm.tsx
│   │   └── performance/
│   │       ├── page.tsx
│   │       └── LeaderboardSnapshot.tsx
│   ├── customer/
│   │   ├── dashboard/page.tsx
│   │   └── tickets/
│   │       ├── page.tsx
│   │       ├── create/
│   │       │   ├── page.tsx
│   │       │   └── CreateTicketForm.tsx   # 4-step multi-form
│   │       └── [id]/
│   │           ├── page.tsx
│   │           └── TicketChat.tsx
│   ├── technician/
│   │   ├── dashboard/
│   │   │   ├── page.tsx
│   │   │   └── TakeTicketButton.tsx
│   │   ├── tickets/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── StatusUpdater.tsx
│   │   └── leaderboard/page.tsx
│   ├── api/
│   │   └── notifications/route.ts
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── page.tsx              # Root redirect by role
│   ├── layout.tsx            # Root layout (Inter font, Toaster)
│   └── globals.css           # Full design system (vanilla CSS, ~800 lines)
├── components/
│   ├── layout/
│   │   ├── DashboardShell.tsx    # Sidebar + topbar for all portals
│   │   └── NotificationBell.tsx
│   └── ui/
│       ├── Badge.tsx             # Status/role badges
│       ├── FileUpload.tsx        # Drag-drop upload for Supabase Storage
│       ├── Modal.tsx
│       ├── RichTextEditor.tsx    # Tiptap editor
│       └── TagInput.tsx
├── lib/
│   ├── db.ts             # Prisma client (adapter-based, singleton)
│   ├── session.ts        # JWT helpers: encrypt, decrypt, requireRole, requireSession
│   └── supabase.ts       # Supabase client helpers (anon + service role)
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── prisma.config.ts  # Prisma 7 config file (datasource URL)
├── proxy.ts              # Next.js 16 routing guard (replaces middleware.ts)
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

- [ ] **Register page UI** — exists at `/register` but UI needs styling review
- [ ] **Customer profile page** — `/customer/profile` not yet created
- [ ] **Admin user delete** — button exists in user list but needs confirmation modal
- [ ] **Real-time notifications** — upgrade from polling to Supabase Realtime channels
- [ ] **Mobile responsive** — DashboardShell sidebar collapses needed for small screens
- [ ] **Ticket point totals** — the `total_points` field on Ticket model is not auto-calculated (left as 0); should be set on creation
- [ ] **Supabase Storage bucket** — bucket named `attachments` must be created in Supabase dashboard with **public** read access enabled (user confirmed "coverage" feature turned on, meaning the bucket is public)
- [ ] **Production deployment** — `sslmode=no-verify` is fine for dev; for production use Supabase's direct DB URL or configure proper certificates

---

## 🚀 Running the Project

```bash
# Install dependencies
npm install

# Sync schema to Supabase
npx prisma db push

# Seed the database
$env:NODE_TLS_REJECT_UNAUTHORIZED="0"; npm run seed

# Start dev server
npm run dev
# → http://localhost:3000
```
