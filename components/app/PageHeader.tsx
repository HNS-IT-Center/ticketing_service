import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

type PageHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumb?: Crumb[];
  /** Primary actions. On a phone they drop below the title at full width. */
  actions?: React.ReactNode;
  className?: string;
};

/**
 * Top of every page: where you are, what this page is, and what you can do
 * from here. Actions sit on the right on desktop and below the title on a
 * phone, where a row of buttons beside a long title would overflow at 360px.
 */
export function PageHeader({ title, description, breadcrumb, actions, className }: PageHeaderProps) {
  return (
    <header data-slot="page-header" className={cn("flex flex-col gap-3", className)}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            {breadcrumb.map((crumb, i) => {
              const last = i === breadcrumb.length - 1;
              return (
                <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                  {crumb.href && !last ? (
                    <Link
                      href={crumb.href}
                      className="rounded-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current={last ? "page" : undefined} className={cn(last && "text-foreground")}>
                      {crumb.label}
                    </span>
                  )}
                  {!last && <ChevronRight aria-hidden="true" className="size-3.5" />}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">{title}</h1>
          {description && <p className="text-sm text-muted-foreground md:text-base">{description}</p>}
        </div>
        {actions && (
          <div className="flex flex-col gap-2 *:w-full sm:flex-row sm:flex-wrap sm:*:w-auto md:shrink-0 md:justify-end">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
