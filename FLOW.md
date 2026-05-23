# HNS IT Center — Application Flow

This document outlines the core workflows, roles, and logical flow of the Ticketing System.

## 1. User Roles & Access

*   **Administrator**: Full access to all stores, users, tickets, and performance metrics. Can perform any action.
*   **Technician**: Primary workforce. Can create tickets, work on tickets, update statuses, and log time. Technicians are assigned to specific **Store Locations**.
*   **Sales**: Can handle revision builds and customer-facing modifications. Sales can only modify tickets they are explicitly assigned to.
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

When a ticket is marked as `done`, the system awards points to the assigned technician:
*   **PC Build**: 4 Points
*   **Service**: 3 Points
*   **Other/Cleaning**: 2 Points

These points feed directly into two leaderboards:
1.  **Top Performers (Technicians)**: Ranks individual technicians based on their total points and success rates.
2.  **Team vs Team Showdown (Stores)**: Aggregates the points of all technicians in a given store, fostering friendly competition between store locations.

---

## 5. System Notifications & Logs

*   **Status Logs**: Every status change (waiting -> on_progress -> done) is logged with a timestamp for auditing.
*   **Time Logs**: Every start, pause, and resume action is logged in `ticket_time_logs` to maintain an accurate KPI record.
*   **WhatsApp Integration**: Technicians/Admins can one-click send templated WhatsApp messages to customers for updates, approvals, or pickup readiness.
