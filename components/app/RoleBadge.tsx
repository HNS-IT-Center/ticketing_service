import type { Role } from "@prisma/client";
import { roleDisplay, TONE_CLASSES } from "@/lib/status-display";
import { cn } from "@/lib/utils";

/** A user's role, with the label and colour from lib/status-display.ts. */
export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  const { label, tone } = roleDisplay(role);
  return (
    <span
      data-slot="role-badge"
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
