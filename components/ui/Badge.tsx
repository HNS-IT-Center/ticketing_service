type BadgeVariant =
  | "waiting"
  | "on_progress"
  | "done"
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
  cancelled: "🔴 Cancelled",
  rejected: "🔴 Rejected",
  Administrator: "Admin",
  Technician: "Technician",
  Sales: "Sales",
  Customer: "Customer",
};

const BADGE_CLASSES: Record<string, string> = {
  waiting: "badge badge-waiting",
  on_progress: "badge badge-on_progress",
  done: "badge badge-done",
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
  let displayLabel = label ?? BADGE_LABELS[variant] ?? variant;
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
