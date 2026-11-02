import Link from "next/link";
import { cn } from "@/lib/utils";

export type FilterChip = { key: string; label: string; href: string; icon?: React.ReactNode };

/**
 * One-tap filters above a list ("All", "Waiting", "Done", …). Each chip is a
 * link, so the filter lives in the URL like the rest of the list's state.
 * They wrap onto a second line on a phone rather than scrolling sideways.
 */
export function FilterChips({
  chips,
  active,
  label,
  className,
}: {
  chips: FilterChip[];
  active: string;
  /** Names the group for screen readers, e.g. "Status". */
  label: string;
  className?: string;
}) {
  return (
    <nav data-slot="filter-chips" aria-label={label} className={className}>
      <ul className="flex flex-wrap gap-2">
        {chips.map((chip) => {
          const isActive = chip.key === active;
          return (
            <li key={chip.key}>
              <Link
                href={chip.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center gap-1.5 rounded-full border px-4 [&_svg]:size-4 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8 md:px-3",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {chip.icon}
                {chip.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
