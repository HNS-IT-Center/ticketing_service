import { cn } from "@/lib/utils";

/**
 * The frame for pages a person sees before or instead of a portal: sign in,
 * an SSO failure, a denied role. One centred card, nothing else on screen.
 *
 * `brand` keeps the HNS blue backdrop the login page has always had;
 * `plain` sits on the app's cream, for a page that is not part of signing in.
 */
export function AuthShell({
  children,
  tone = "brand",
  className,
}: {
  children: React.ReactNode;
  tone?: "brand" | "plain";
  className?: string;
}) {
  return (
    <div
      data-slot="auth-shell"
      className={cn(
        "flex min-h-svh items-center justify-center p-4 sm:p-6",
        tone === "brand"
          ? "bg-[linear-gradient(135deg,var(--primary-dark)_0%,var(--primary)_50%,#2557bb_100%)]"
          : "bg-background",
      )}
    >
      <div
        className={cn(
          "flex w-full max-w-[460px] animate-in flex-col gap-6 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-xl duration-300 fade-in slide-in-from-bottom-2 sm:p-10",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
