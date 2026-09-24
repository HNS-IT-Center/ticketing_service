# Issue: `adminUpdateTicketStatusAction` has no transition guard

**Severity:** Medium — silently inflates technician KPI. No data loss, no broken flow.
**Scope:** deliberately *not* fixed on `feat/rma-warranty-claim`. Needs its own branch.
**Found:** 2026-09-24, while unifying the KPI rules.

> ⛔ **One part of this issue is a blocker:** `delivery.ts:50` swallows this action's
> return value and reports success anyway. It must be fixed **before any new caller of
> `adminUpdateTicketStatusAction` is added**, independently of when the transition guard
> itself gets built. See [the blocker section](#-blocker--fix-before-adding-any-new-caller-of-adminupdateticketstatusaction).

---

## What is wrong

[`app/actions/admin.ts:256`](../app/actions/admin.ts#L256) — `adminUpdateTicketStatusAction`
accepts any of the ten ticket statuses and writes it, whatever the ticket's current status is.
The only checks between the lookup and the write are "does the ticket exist" and, since this
branch, "is it with the RMA desk":

```ts
const ticket = await db.ticket.findUnique({ where: { id: ticketId }, ... });
if (!ticket) return { error: "Ticket not found" };

if (ticket.status === "rma_process") { ... }   // added on feat/rma-warranty-claim

await db.$transaction([
  db.ticket.update({ where: { id: ticketId }, data: { status: newStatus } }),
  db.ticketStatusLog.create({ data: { old_status: ticket.status, new_status: newStatus, ... } }),
]);
```

There is no table of legal transitions. `completed -> waiting`, `cancelled -> on_progress`,
`delivered -> waiting` and every other combination is accepted.

Both Administrator and Sales reach this action (`requireRole("Administrator", "Sales")`).

For comparison, the RMA side does have a transition table —
[`lib/rma/state-machine.ts`](../lib/rma/state-machine.ts), enforced by
`validateRmaTransition()`. Tickets have no equivalent.

## Why it matters — `TechnicianPerformance` double counting

Points are credited per *status log row*, not per ticket. The rule lives in
[`lib/kpi.ts`](../lib/kpi.ts): a non-claim ticket earns when a log with `new_status = 'done'`
is written.

So this sequence credits the same ticket twice:

| Step | Who | Status | Effect |
|---|---|---|---|
| 1 | Technician | `on_progress` -> `done` | `tickets_handled` +1, `success_count` +1, points +N |
| 2 | Admin/Sales | `done` -> `on_progress` | no counter change, but the ticket is workable again |
| 3 | Technician | `on_progress` -> `done` | `tickets_handled` +1, `success_count` +1, **points +N again** |

Repeatable without limit. It hits:

- `TechnicianPerformance.total_points_completed`, `.tickets_handled`, `.success_count`
  (written by [`app/actions/technician.ts:342`](../app/actions/technician.ts#L342) and
  [`app/actions/admin.ts:316`](../app/actions/admin.ts#L316))
- the live leaderboard, which re-derives from `TicketStatusLog`
  ([`lib/leaderboard.ts`](../lib/leaderboard.ts))
- `getTopTechnicianOfMonth` / `getTopStoreOfMonth`
  ([`lib/performance.ts`](../lib/performance.ts)), and therefore the monthly achievement
  titles awarded from them
- the Admin -> Performance report
  ([`app/admin/performance/page.tsx:77`](../app/admin/performance/page.tsx#L77))

Deduplicating per ticket at read time is **not** the fix: a second `done` after genuine
rework is arguably legitimate work. The question is which transitions are legal at all, and
that is a business decision.

## Is it being exploited today?

Unknown. To check on any environment:

```sql
-- tickets that reached `done` more than once
SELECT ticket_id, COUNT(*) AS done_count
FROM   "TicketStatusLog"
WHERE  new_status = 'done'
GROUP  BY ticket_id
HAVING COUNT(*) > 1
ORDER  BY done_count DESC;
```

```sql
-- every backwards move, with who did it
SELECT l.created_at, l.old_status, l.new_status, u.name, u.role, t.ticket_code
FROM   "TicketStatusLog" l
JOIN   "Ticket" t ON t.id = l.ticket_id
JOIN   "User"   u ON u.id = l.changed_by
WHERE  (l.old_status = 'done'      AND l.new_status IN ('waiting', 'on_progress'))
   OR  (l.old_status = 'completed' AND l.new_status <> 'completed')
   OR  (l.old_status = 'cancelled' AND l.new_status <> 'cancelled')
ORDER  BY l.created_at DESC;
```

If the second query returns nothing, this is a latent bug and the fix is cheap. If it returns
rows, decide separately whether to correct the affected `TechnicianPerformance` totals — the
existing agreement is that historical rows are left alone.

## Suggested fix

1. A `TICKET_TRANSITIONS` table beside the RMA one — same shape as
   `lib/rma/state-machine.ts`, pure and unit-testable, no DB access.
2. `adminUpdateTicketStatusAction` and `updateTicketStatusAction` both validate against it.
   Today they each carry their own ad-hoc checks.
3. Decide the reopen policy explicitly. Two reasonable answers:
   - **No reopening.** `done` and past are terminal; rework means a new ticket.
   - **Reopening allowed, credited once.** Permit `done -> on_progress`, and have the KPI
     rule count only the *first* qualifying log per ticket. That means `lib/kpi.ts` gains a
     per-ticket dedupe and the writers become idempotent.
4. The UI is already narrow and does not need widening work: `AdminStatusPanel.tsx` only
   offers actions for `waiting` and `on_progress` and renders nothing otherwise, and
   `AdminWorkflowPanel.tsx` gates each handover button on a specific status. The hole is in
   the server action, which is callable directly and is the thing to fix.

### ⛔ BLOCKER — fix before adding any new caller of `adminUpdateTicketStatusAction`

**This is not optional and not "nice to have". It must be fixed before anyone wires up a new
call site for this action, or adds a handover button that targets a different status.**

[`app/actions/delivery.ts:50`](../app/actions/delivery.ts#L50) — `uploadDeliveryProofAction`
calls `adminUpdateTicketStatusAction` and **discards its return value**, then returns
`{ success: true }` regardless:

```ts
await adminUpdateTicketStatusAction(ticketId, status);
return { success: true };
```

Any refusal from the action is swallowed. The proof file is stored, the toast says the update
worked, and the status never moves.

**Why it is a blocker rather than a latent nit.** It is dormant purely by accident: no panel
currently offers a handover button for a status this action refuses. The moment one does — a
new step in the chain, a status added to `AdminWorkflowPanel.tsx`, a new caller anywhere —
the bug is live on day one, with no code change to `delivery.ts` required to activate it.

**And the symptom actively misleads.** A refusal looks identical to a success from the user's
side, so the report will be "status tidak berubah, padahal saya sudah klik dan muncul tulisan
berhasil". Nobody will suspect the upload action, because the upload genuinely worked. The
guard doing the refusing will look like the broken thing, and whoever added the new caller
will spend their debugging time on the wrong file. Fixing the swallow first means the very
first person to trip a guard sees the actual reason.

**The fix, one line:**

```ts
const result = await adminUpdateTicketStatusAction(ticketId, status);
if (result?.error) return { error: result.error };
return { success: true };
```

Worth a quick sweep for the same shape elsewhere while in there — any `await someAction(...)`
whose result is dropped before an unconditional `{ success: true }`.

## Not in scope here

`rma_process` is already locked, on `feat/rma-warranty-claim`. A ticket with an open
`RmaCase` cannot be moved from the admin portal or the technician portal; the only way out is
`transitionRmaAction` reaching `closed` or `cancelled`, which returns the ticket to `done`
itself. Tests: `app/actions/admin.test.ts`, QC plan C-09a–C-09c.

`adminUpdateTicketStatusAction` also now requires a reason for a `warranty_claim` moving to
`done` from either `waiting` or `on_progress`, and writes `claim_eligible = false` itself.
`waiting` is in that list because this action has no `HANDOVER_CHAIN` to reject
`waiting -> done` the way `updateTicketStatusAction` does. Tests: same file, QC plan
D-06–D-12.

Neither of those is a transition rule: both refuse a specific status change on a specific
ticket type for a specific reason. What this issue proposes — a table saying which of the ten
statuses may follow which, for every ticket type — is still absent.
