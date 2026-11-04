import "server-only";
import { db } from "@/lib/db";
import type { ActivityAction } from "@/lib/activity-catalog";

/** Who did it — a session, or the account a login was attempted for. */
export type ActivityActor = { userId: string | null; name: string; role: string };

export type ActivityEntity = {
  type: "ticket" | "user" | "store" | "vendor" | "service_job" | "rma_case" | "charge" | "part" | "access" | "target";
  id?: string | null;
  /** Ticket code, vendor name … — looked up for a ticket when left out. */
  label?: string | null;
};

const MAX_SUMMARY = 2000;

/**
 * Writes one line to the activity log. Called after the action it records has
 * succeeded, never before.
 *
 * Never throws: the action has already happened, and a log that could not be
 * written must not turn a saved change into an error on the user's screen.
 * The failure goes to the server log instead.
 */
export async function logActivity(
  actor: ActivityActor | { userId: string; name: string; role: string } | null,
  action: ActivityAction,
  summary: string,
  entity?: ActivityEntity,
): Promise<void> {
  // The integration tests drive the real actions against the local database
  // and would leave hundreds of lines from accounts they then delete. A test
  // about the log itself turns it back on with ACTIVITY_LOG_IN_TESTS=1.
  if (process.env.VITEST && process.env.ACTIVITY_LOG_IN_TESTS !== "1") return;
  try {
    let label = entity?.label ?? null;
    if (!label && entity?.type === "ticket" && entity.id) {
      const t = await db.ticket.findUnique({ where: { id: entity.id }, select: { ticket_code: true } });
      label = t?.ticket_code ?? null;
    }
    await db.activityLog.create({
      data: {
        actor_id: actor?.userId ?? null,
        actor_name: actor?.name || "—",
        actor_role: actor?.role || "—",
        action,
        entity_type: entity?.type ?? null,
        entity_id: entity?.id ?? null,
        entity_label: label,
        summary: summary.length > MAX_SUMMARY ? `${summary.slice(0, MAX_SUMMARY - 1)}…` : summary,
      },
    });
  } catch (err) {
    console.error("[ACTIVITY LOG]", action, err instanceof Error ? err.message : err);
  }
}
