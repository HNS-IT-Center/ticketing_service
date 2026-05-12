type BadgeVariant =
  | "waiting"
  | "on_progress"
  | "done"
  | "ready_for_pickup"
  | "waiting_pickup"
  | "handed_to_courier"
  | "delivered"
  | "completed"
  | "cancelled"
  | "rejected"
  | "Administrator"
  | "Technician"
  | "Sales"
  | "Customer";

const BADGE_LABELS: Record<string, string> = {
  waiting: "⏳ Waiting",
  on_progress: "🔵 On Progress",
  done: "✅ Done",
  ready_for_pickup: "📦 Ready Pickup",
  waiting_pickup: "🔔 Waiting Pickup",
  handed_to_courier: "🚚 To Courier",
  delivered: "📬 Delivered",
  completed: "🎉 Completed",
  cancelled: "🔴 Cancelled",
  rejected: "🔴 Rejected",
  Administrator: "Admin",
  Technician: "Technician",
  Sales: "CS",
  Customer: "Customer",
};

const BADGE_CLASSES: Record<string, string> = {
  waiting: "badge badge-waiting",
  on_progress: "badge badge-on_progress",
  done: "badge badge-done",
  ready_for_pickup: "badge badge-done",
  waiting_pickup: "badge badge-on_progress",
  handed_to_courier: "badge badge-on_progress",
  delivered: "badge badge-done",
  completed: "badge badge-done",
  cancelled: "badge badge-cancelled",
  rejected: "badge badge-rejected",
  Administrator: "badge badge-admin",
  Technician: "badge badge-technician",
  Sales: "badge badge-sales",
  Customer: "badge badge-customer",
};

export default function Badge({
  variant,
  label,
  technicianId,
}: {
  variant: BadgeVariant | string;
  label?: string;
  technicianId?: string | null;
}) {
  let displayLabel = label ?? BADGE_LABELS[variant] ?? variant.replace(/_/g, " ");
  if (!label && variant === "waiting") {
    // Determine dynamic waiting label
    displayLabel = technicianId ? "⏳ Waiting for Work" : "⏳ Waiting for Technician";
  }

  return (
    <span className={BADGE_CLASSES[variant] ?? "badge"}>
      {displayLabel}
    </span>
  );
}
