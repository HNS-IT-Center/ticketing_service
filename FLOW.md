# HNS IT Center — Application Flow

This document outlines the core workflows, roles, and logical flow of the Ticketing System.

## 1. User Roles & Access

*   **Administrator**: Full access to all stores, users, tickets, and performance metrics. Can perform any action.
*   **Technician**: Primary workforce. Can create tickets, work on tickets, update statuses, and log time. Technicians are assigned to specific **Store Locations**.
*   **Sales**: Can handle revision builds and customer-facing modifications. Sales can only modify tickets they are explicitly assigned to.
*   **RMA**: Runs the warranty desk. Receives units handed over by technicians, deals with the vendor, and closes the case. Has its own portal at `/rma` and does not work ordinary tickets. Administrators can do everything the RMA desk can.
*   **Customer (No Login)**: Customers do not have accounts in the system. They track their service progress through a unique, unguessable **Public Shared Link**.

---

## 2. Store Locations & Teams

*   The company operates multiple physical stores (e.g., Nagoya Gateway `NGW`).
*   Each store has its own code prefix for tickets.
*   Technicians are assigned to one or more stores.
*   The **Team vs Team Leaderboard** aggregates the performance of all technicians within a store to rank the store's overall performance.

---

## 3. The Ticket Lifecycle

### A. Intake & Creation
1.  A Customer brings a device to the store.
2.  A **Technician** (or Admin) creates a new ticket.
3.  The Technician inputs:
    *   Customer details (Name, WhatsApp/Phone, Address).
    *   Device information and problem description.
    *   Service Category (e.g., Build PC, Service, Upgrade).
4.  The system generates a unique **Ticket Code** (e.g., `NGW-1234`) and a secure **Public Tracking Token**.
5.  The Customer is given the tracking link to monitor the repair status in real-time.

### B. Working on the Ticket (Time Tracking & KPI)
The system tracks the actual active working time of a technician without SLA inflation:
1.  **Start Work**: The technician clicks "Start Work". The ticket status shifts to `on_progress` and the timer begins.
2.  **Pause Work**: If the technician is blocked (e.g., waiting for customer approval, waiting for a spare part), they click "Pause".
    *   A dialog prompts them to enter a **Reason for Pausing**.
    *   The active timer is frozen.
3.  **Resume Work**: When the blocker is resolved, the technician clicks "Resume" (providing a reason), and the timer continues.
4.  **Finish Work**: The technician marks the ticket as `done`. The final working time is calculated by summing up all active (unpaused) intervals.

### C. Revisions (Sales Role)
*   If the ticket involves a "Build PC" or requires additional sales items after the technician completes the initial work, a **Sales** representative can take over.
*   Sales can only modify tickets explicitly assigned to them.
*   They manage add-ons and finalize the build requirements with the customer.

### D. Handover & Completion
1.  Once the device is fully repaired/built, the status is moved to `ready_for_pickup` or `handed_to_courier`.
2.  The customer is notified via WhatsApp (using the integrated WA button).
3.  Once the customer receives the device, the ticket is marked as `completed`.

---

## 4. Performance & Leaderboards

### The point table

**What is actually credited** — `lib/points.ts`, used by `app/actions/tickets.ts`,
`app/actions/technician.ts` and `app/actions/rma.ts`:

| Ticket type | Points credited |
|---|---|
| Service | 5 (3 when the device is `Other_Device`) |
| PC Build | 4 |
| Cleaning | 3 (5 for `Full_Repaste` or `Full_Repaste_CPU_GPU`) |
| Warranty claim | 2 |
| Upgrade / anything else | 2 |

> #### ⚠️ This is not yet the only table in the codebase
>
> Three other tables are still live, and they disagree. Read this before quoting a number to
> anyone.
>
> | Where | What it uses | Disagrees on |
> |---|---|---|
> | `lib/leaderboard.ts`, `lib/performance.ts`, `app/admin/performance/page.tsx`, the two technician dashboards | cleaning 2, or 4 on `PC_Gaming`; service always 5 | cleaning, and service on `Other_Device` |
> | `app/technician/tickets/page.tsx`, `app/sales/tickets/page.tsx` (the "⭐ N pts" badge) | same as above, **plus 3 per `extra_service`** | the above, plus extras that nothing credits |
> | `app/actions/admin.ts` (credits when an admin or Sales closes a ticket) | service 4, cleaning 4 only for `Deep_Clean` else 3, upgrade 3 | service, cleaning, upgrade |
>
> The divergence dates from 2026-07-27 (`0fed3b9`), when the writers' table was changed and
> nothing else followed. So the leaderboard has been rendering figures that no writer credits
> for about two months, and a ticket closed by an admin is worth a different number than the
> same ticket closed by a technician.
>
> Unifying them moves figures on screen and changes credited points for admin-closed tickets,
> so it is deliberately its own branch: **`fix/points-table-unification`**. Until that lands,
> do not assume a badge and the leaderboard agree, and do not add a fifth table — import from
> `lib/points.ts`.

`extra_services` earns nothing. Only the two ticket-list badges add +3 per extra; no writer
has ever credited it, so the badge overstates the reward. Whether extras should earn is an
open question, and it belongs with the unification branch.

### When the points are awarded

Defined once, in `lib/kpi.ts`:

```
count it if  (type != 'warranty_claim' && new_status == 'done')
          || (type == 'warranty_claim' && new_status == 'rma_process')
```

An ordinary ticket earns at `done`. A warranty claim earns at handover to the RMA desk,
because that is where the technician's work on it ends — see section 6. Nothing is awarded
again further down the handover chain: `ready_for_pickup`, `waiting_pickup`,
`handed_to_courier`, `delivered` and `completed` all credit zero.

`cancelled` and `rejected` add a `failed_count` instead, for every ticket type.

**`tickets_handled` counts every terminal state, so it is not a success measure.** Use
`success_count` for levels and rankings.

These points feed directly into two leaderboards:
1.  **Top Performers (Technicians)**: Ranks individual technicians based on their total points and success rates.
2.  **Team vs Team Showdown (Stores)**: Aggregates the points of all technicians in a given store, fostering friendly competition between store locations.

---

## 5. Warranty Claim & RMA Flow

A `warranty_claim` ticket behaves like any other ticket until the technician has examined the
unit. From `on_progress` it has exactly two legal exits.

### Exit 1 — handed over to the RMA desk

The technician fills in the service form (unit ownership, purchase invoice, serial number
verified, physical condition, fault description, test result) and the server opens an
`RmaCase` with a code of the form `RMA-{STORECODE}-{YYMM}-{0001}`. The ticket moves to
`rma_process` and is read-only for the technician from that moment; only the RMA desk and
Administrators can move it on.

The case then walks its own state machine (`lib/rma/state-machine.ts`):

```
pending_verification -> verified -> submitted_to_vendor -> in_vendor_process
                     -> vendor_decided -> unit_received -> closed
```

with `on_hold` and `cancelled` as branches. When the case reaches `closed` or `cancelled`,
the server puts the ticket back to `done` so the unit can go to the customer through the
ordinary handover chain.

### Exit 2 — not eligible

The technician examined the unit and the warranty does not cover it. The ticket goes to
`done` with `TicketWarrantyDetail.claim_eligible = false` and a required reason. It is
**not** `rejected`: `rejected` means "turned away at intake", it is terminal for the handover
chain, and it would charge the technician a `failed_count` for an examination they did
correctly. The unit still has to go back to its owner, so it takes the normal `done` route.

### Reporting — read this before writing any claim statistic

All three endings finish `done` -> `completed`. **A report that filters only on status will
count a claim the vendor rejected, and a claim that never qualified, as a successful
warranty claim.** Every claim metric must filter on `claim_eligible` and `decision`:

| Metric | Definition |
|---|---|
| Claims received | every ticket with `ticket_type = 'warranty_claim'` |
| Not eligible | `warranty_detail.claim_eligible = false` — never reached the vendor |
| Submitted to vendor | has an `RmaCase` with `submitted_at != null` |
| Claim succeeded | `rma_case.decision` in (`repaired`, `replaced`, `refund`) |
| Rejected by vendor | `rma_case.decision = 'rejected'` |
| Dropped | `rma_case.status = 'cancelled'` — no decision was ever reached |

"Claims received" minus the five rows below it is the number still in flight.

### KPI

The technician is credited at handover (exit 1), never at the `done` that the RMA desk writes
when the case closes — see section 4. A claim taken down exit 2 credits nothing at all:
neither a success nor a failure. Charging a `failed_count` for correctly turning down a claim
would make it expensive to do the right thing.

### What the customer sees

The public tracking page (`/{date}/{ticketCode}`) shows a one-line verdict above the ticket
details, built by `lib/rma/public-status.ts`: which stage the claim is at while it is out, and
which of the three endings it reached once it is back.

The following are internal and must never appear on that page: `vendor_rma_number`,
`hold_reason`, `decision_notes`, `stock_origin`, and the text of any `RmaEvent.note`. The
public page selects RMA fields one by one rather than including the whole case, and
`getPublicClaimOutcome()` takes only status, decision and the ineligibility reason as
arguments, so none of those fields can reach it.

---

## 6. System Notifications & Logs

*   **Status Logs**: Every status change (waiting -> on_progress -> done) is logged with a timestamp for auditing.
*   **Time Logs**: Every start, pause, and resume action is logged in `ticket_time_logs` to maintain an accurate KPI record.
*   **WhatsApp Integration**: Technicians/Admins can one-click send templated WhatsApp messages to customers for updates, approvals, or pickup readiness.
