import type { Role } from "@prisma/client";
import { roleDisplay, TONE_CLASSES } from "@/lib/status-display";
import { cn } from "@/lib/utils";

/** A user's role, with the label and colour from lib/status-display.ts. */
/** `label`: the made role's name, when the account has one; the tone stays its base's. */
export function RoleBadge({ role, label: name, className }: { role: Role; label?: string | null; className?: string }) {
  const { label: baseLabel, tone } = roleDisplay(role);
  const label = name || baseLabel;
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
