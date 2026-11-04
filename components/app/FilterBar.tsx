import { Search } from "lucide-react";
import { LiveSearchInput } from "@/components/app/LiveSearchInput";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * The row above a list: search, filters, and the actions that act on them.
 *
 * Layout only. The list pages filter through the URL with a plain GET form
 * (`lib/ticket-list-filter.ts`), so a FilterBar is normally the form itself —
 * pass `action` and it renders `<form method="get" role="search">`, which keeps
 * the filters working without JavaScript and keeps them in a shareable link.
 *
 * On a phone the search takes the full width and the filters wrap beneath it;
 * nothing scrolls sideways at 360px.
 */
export function FilterBar({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  /** When set, the bar is a GET form submitting to this path. */
  action?: string;
  className?: string;
}) {
  const classes = cn("flex flex-col gap-2 md:flex-row md:flex-wrap md:items-end md:gap-3", className);
  if (action !== undefined) {
    return (
      <form data-slot="filter-bar" role="search" method="get" action={action} className={classes}>
        {children}
      </form>
    );
  }
  return (
    <div data-slot="filter-bar" role="search" className={classes}>
      {children}
    </div>
  );
}

/**
 * A search box with a visible-to-screen-readers label and a leading icon. It
 * filters as you type (LiveSearchInput); Enter still submits the form.
 */
export function FilterBarSearch({
  name = "q",
  label,
  placeholder,
  defaultValue,
  className,
}: {
  name?: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  className?: string;
}) {
  const id = `filter-${name}`;
  return (
    <div data-slot="filter-bar-search" className={cn("relative min-w-0 md:min-w-64 md:flex-1", className)}>
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
      <LiveSearchInput id={id} name={name} placeholder={placeholder} defaultValue={defaultValue} className="pl-9" />
    </div>
  );
}

/** One labelled filter control (a select, a date). The label stays visible. */
export function FilterBarField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-slot="filter-bar-field" className={cn("flex min-w-0 flex-col gap-1.5 md:w-48", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
