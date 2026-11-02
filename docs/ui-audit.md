# UI audit — inline styles and vanilla classes

Measured 2026-10-28 on `main` at `74bf5b3`, the base of `feat/ui-foundation` (UI overhaul,
Phase 1). This is the starting line the later phases are measured against: a page is
migrated when its row reaches 0 / 0 (dynamic values excepted).

## Totals

- **1,835** `style={{ … }}` in `app/` and `components/` (`.tsx`), across **95** files.
- **1,258** uses of a vanilla class from `app/globals.css` inside a `className`.
- **120** class names defined in `globals.css` (1,538 lines).
- The four shadcn components that existed before this phase (`button`, `card`,
  `separator`, `shadcn-badge`) had **no importers**.

### By phase

| Phase | Files | `style={{}}` | Vanilla classes |
|:-:|---:|---:|---:|
| 2 | 3 | 65 | 27 |
| 3 | 24 | 555 | 396 |
| 4 | 35 | 583 | 518 |
| 5 | 14 | 399 | 145 |
| 6 | 5 | 73 | 23 |
| shared | 12 | 87 | 62 |
| — | 2 | 73 | 87 |

Phase 2 = app shell, 3 = technician, 4 = admin and Store Coordinator, 5 = RMA desk and
Sales, 6 = public page, login and error pages. "shared" = components used by several
portals; each moves with the first phase that needs it. "—" = `app/customer/`, leftover
code nothing routes to (BL8/BL29), deliberately not redesigned.

## How it was counted

- `style={{` occurrences per `.tsx` file.
- Vanilla classes: every token inside a `className="…"`, `` className={`…`} `` or a string
  literal inside `className={…}` that matches a class selector defined in `globals.css`.
  Class names built at runtime (e.g. `badge-${status}` via `BADGE_CLASSES` in
  `components/ui/Badge.tsx`) are **not** counted, so a class missing from this table is
  not proof it is unused. A class is deleted from `globals.css` only after a grep for its
  name across `app/`, `components/` and `lib/` returns nothing.

Most-used vanilla classes: `btn` 170, `skeleton` 138, `form-input` 114, `card` 93,
`form-label` 80, `form-group` 78, `btn-primary` 67, `btn-sm` 65, `skeleton-text` 54,
`btn-ghost` 35, `form-error` 32, `btn-secondary` 31, `skeleton-title` 29, `badge` 19,
`spinner` 17, `table-wrapper` 13, `empty-state` 13, `admin-ticket-table` 9,
`admin-ticket-cards` 9, `stat-card` 8.

Priority: **High** = the app shell, the technician flow (the main users, on Android
phones), or any file with 50+ combined; **Medium** = 15–49; **Low** = under 15.

## Two traps found while auditing

1. **Tailwind padding and margin do nothing.** `* { margin: 0; padding: 0 }` sits outside
   any `@layer`, and unlayered CSS beats every Tailwind utility, so `p-*` / `m-*` are dead.
   There are **186** such dead classes in **30** production files today. Moving the reset
   into `@layer base` would bring all of them to life at once and change those pages.
   Phase 1 instead exempts `[data-slot]` subtrees (every shadcn and `components/app`
   component carries one) from the legacy reset — Tailwind's own preflight still resets
   them — so the new components work and no existing page moves. Phase 7 deletes the
   legacy reset outright.
2. **Legacy code reads the shadcn token names.** `var(--primary)` is used 143×,
   `var(--border)` 82×, `var(--accent)` 28×. `--primary` has been near-black since the
   shadcn init (`0b3dd66`, 2026-05-19); before it was `#16469d`. Phase 1 maps it back to
   HNS blue, so every legacy `.btn-primary`, link and focus ring turns blue again — the
   one production-visible change of this phase, approved by the owner 2026-10-28.
   `var(--accent)` is used as if it were red ("Unassigned", Reject, Cancel in
   `AdminStatusPanel`) but `--accent` is shadcn's subtle hover fill, so that text renders
   almost invisible. Not fixed here; those call sites move to `text-destructive` in Phase 4.

Also: legacy `--text-muted` `#718096` is 3.6:1 on cream, below AA. The new
`--muted-foreground` is `#5c6676` (5.2:1 on cream, 4.7:1 on `--muted`).

## Per file

| File | `style={{}}` | Vanilla classes | Phase | Priority |
|---|---:|---:|:-:|---|
| `app/technician/tickets/create/CreateTicketForm.tsx` | 95 | 108 | 3 | High |
| `app/technician/tickets/[id]/StatusUpdater.tsx` | 103 | 50 | 3 | High |
| `app/customer/tickets/create/CreateTicketForm.tsx` | 64 | 76 | — | — (BL8/BL29, not redesigned) |
| `app/rma/logs/page.tsx` | 79 | 20 | 5 | High |
| `app/rma/dashboard/page.tsx` | 77 | 8 | 5 | High |
| `app/admin/tickets/[id]/page.tsx` | 64 | 20 | 4 | High |
| `app/admin/users/[id]/EditUserForm.tsx` | 35 | 47 | 4 | High |
| `app/admin/tickets/[id]/PcBuildHandover.tsx` | 52 | 13 | 4 | High |
| `app/rma/tickets/page.tsx` | 31 | 33 | 5 | High |
| `app/sales/tickets/page.tsx` | 31 | 33 | 5 | High |
| `app/technician/tickets/page.tsx` | 31 | 33 | 3 | High |
| `app/admin/leaderboard/page.tsx` | 42 | 19 | 4 | High |
| `app/admin/tickets/page.tsx` | 30 | 31 | 4 | High |
| `app/rma/cases/[id]/RmaActionPanel.tsx` | 43 | 16 | 5 | High |
| `app/admin/tickets/[id]/loading.tsx` | 27 | 31 | 4 | High |
| `app/technician/tickets/[id]/loading.tsx` | 27 | 31 | 3 | High |
| `app/admin/performance/page.tsx` | 38 | 19 | 4 | High |
| `app/sales/tickets/[id]/page.tsx` | 46 | 10 | 5 | High |
| `app/technician/tickets/[id]/page.tsx` | 46 | 10 | 3 | High |
| `components/layout/DashboardShell.tsx` | 27 | 23 | 2 | High |
| `app/admin/users/create/CreateUserForm.tsx` | 13 | 35 | 4 | Medium |
| `app/technician/dashboard/page.tsx` | 28 | 18 | 3 | High |
| `app/technician/tickets/[id]/ReplacedPartsPanel.tsx` | 40 | 6 | 3 | High |
| `app/admin/tickets/[id]/AdminWorkflowPanel.tsx` | 18 | 26 | 4 | Medium |
| `app/admin/dashboard/page.tsx` | 33 | 10 | 4 | Medium |
| `app/technician/profile/page.tsx` | 23 | 16 | 3 | High |
| `app/[date]/[shareToken]/page.tsx` | 39 | 0 | 6 | Medium |
| `app/admin/dashboard/loading.tsx` | 15 | 23 | 4 | Medium |
| `app/login/page.tsx` | 20 | 17 | 6 | Medium |
| `app/admin/tickets/[id]/DeleteTicketPanel.tsx` | 28 | 8 | 4 | Medium |
| `app/admin/logs/page.tsx` | 24 | 11 | 4 | Medium |
| `app/technician/leaderboard/page.tsx` | 18 | 15 | 3 | High |
| `app/admin/logs/loading.tsx` | 14 | 18 | 4 | Medium |
| `app/technician/dashboard/loading.tsx` | 14 | 18 | 3 | High |
| `app/admin/leaderboard/loading.tsx` | 15 | 16 | 4 | Medium |
| `app/admin/stores/[id]/StoreEditForm.tsx` | 2 | 29 | 4 | Medium |
| `app/admin/users/loading.tsx` | 15 | 16 | 4 | Medium |
| `app/admin/users/page.tsx` | 15 | 16 | 4 | Medium |
| `app/technician/leaderboard/loading.tsx` | 15 | 16 | 3 | High |
| `app/admin/profile/loading.tsx` | 13 | 17 | 4 | Medium |
| `app/technician/profile/loading.tsx` | 13 | 17 | 3 | High |
| `components/ui/ChangePasswordForm.tsx` | 16 | 14 | shared | Medium |
| `app/admin/performance/loading.tsx` | 15 | 13 | 4 | Medium |
| `components/layout/RequestsBell.tsx` | 26 | 2 | 2 | High |
| `app/admin/tickets/[id]/AdminAssignPanel.tsx` | 12 | 14 | 4 | Medium |
| `app/admin/performance/ExportToPDF.tsx` | 11 | 14 | 4 | Medium |
| `app/admin/tickets/loading.tsx` | 14 | 11 | 4 | Medium |
| `app/technician/dashboard/AvailableTickets.tsx` | 16 | 9 | 3 | High |
| `app/technician/tickets/loading.tsx` | 14 | 11 | 3 | High |
| `app/rma/cases/[id]/page.tsx` | 21 | 3 | 5 | Medium |
| `components/rma/RmaStatusCard.tsx` | 22 | 2 | 5 | Medium |
| `components/ui/FileUpload.tsx` | 19 | 5 | shared | Medium |
| `app/customer/tickets/[id]/TicketChat.tsx` | 9 | 11 | — | — (BL8/BL29, not redesigned) |
| `app/rma/dashboard/AttentionCard.tsx` | 19 | 1 | 5 | Medium |
| `app/technician/leaderboard/StoreLeaderboard.tsx` | 17 | 3 | 3 | High |
| `components/ui/ProfileForm.tsx` | 6 | 14 | shared | Medium |
| `app/admin/performance/LeaderboardSnapshot.tsx` | 5 | 14 | 4 | Medium |
| `app/sales/dashboard/page.tsx` | 13 | 6 | 5 | Medium |
| `app/technician/tickets/[id]/ExtraPointsPanel.tsx` | 17 | 1 | 3 | High |
| `components/ui/FilePreview.tsx` | 12 | 6 | shared | Medium |
| `app/admin/stores/create/page.tsx` | 1 | 16 | 4 | Medium |
| `app/technician/schedule/ScheduleManager.tsx` | 1 | 16 | 3 | High |
| `components/TicketChat.tsx` | 13 | 4 | shared | Medium |
| `app/admin/performance/SharePerformance.tsx` | 6 | 10 | 4 | Medium |
| `components/ui/TermsModal.tsx` | 15 | 0 | shared | Medium |
| `app/technician/leaderboard/LeaderboardBars.tsx` | 14 | 0 | 3 | High |
| `components/layout/NotificationBell.tsx` | 12 | 2 | 2 | High |
| `app/rma/cases/[id]/loading.tsx` | 7 | 6 | 5 | Low |
| `app/technician/tickets/[id]/HoldEvidencePanel.tsx` | 9 | 4 | 3 | High |
| `app/admin/profile/page.tsx` | 4 | 8 | 4 | Low |
| `app/technician/dashboard/TakeTicketButton.tsx` | 3 | 9 | 3 | High |
| `app/[date]/[shareToken]/PublicChat.tsx` | 12 | 0 | 6 | Low |
| `app/rma/dashboard/loading.tsx` | 6 | 5 | 5 | Low |
| `components/ui/DraftBanner.tsx` | 4 | 5 | shared | Low |
| `app/admin/stores/page.tsx` | 0 | 8 | 4 | Low |
| `app/technician/schedule/page.tsx` | 5 | 2 | 3 | High |
| `app/admin/tickets/[id]/AdminStatusPanel.tsx` | 3 | 3 | 4 | Low |
| `app/admin/tickets/[id]/PublicChatToggle.tsx` | 6 | 0 | 4 | Low |
| `components/ui/Modal.tsx` | 1 | 5 | shared | Low |
| `app/admin/tickets/[id]/WorkingTimeDisplay.tsx` | 5 | 0 | 4 | Low |
| `app/error.tsx` | 2 | 3 | 6 | Low |
| `app/technician/leaderboard/LeaderboardFilter.tsx` | 2 | 2 | 3 | High |
| `app/admin/tickets/create/page.tsx` | 2 | 1 | 4 | Low |
| `app/admin/tickets/[id]/CustomerWhatsAppActions.tsx` | 2 | 1 | 4 | Low |
| `app/rma/tickets/create/page.tsx` | 2 | 1 | 5 | Low |
| `app/sales/tickets/create/page.tsx` | 2 | 1 | 5 | Low |
| `app/technician/tickets/create/page.tsx` | 2 | 1 | 3 | High |
| `app/unauthorized/page.tsx` | 0 | 3 | 6 | Low |
| `components/ui/RichTextEditor.tsx` | 0 | 3 | shared | Low |
| `components/ui/TagInput.tsx` | 0 | 3 | shared | Low |
| `app/admin/users/create/page.tsx` | 2 | 0 | 4 | Low |
| `app/admin/users/[id]/page.tsx` | 2 | 0 | 4 | Low |
| `app/technician/dashboard/RefreshButton.tsx` | 2 | 0 | 3 | High |
| `components/NativeSSOLoginButton.tsx` | 0 | 2 | shared | Low |
| `components/ui/PickupMethodSelector.tsx` | 1 | 1 | shared | Low |
