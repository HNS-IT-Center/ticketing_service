import React from "react";
import Link from "next/link";
import { Clock, LogOut, ShieldX } from "lucide-react";
import { AuthShell } from "@/components/app/AuthShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { logoutAction } from "@/app/actions/auth";
import { getSession } from "@/lib/session";
import { ssoEnv } from "@/lib/sso/config";

/**
 * Where a signed-in account with no portal of its own lands.
 *
 * proxy.ts lets this route through before every other check, so it renders for
 * any session and for none. That matters: it is the redirect target for a
 * denied role, and sending such a session to /login instead would bounce it
 * straight back here — the redirect loop this page exists to break.
 *
 * Logging out is therefore the primary action: without it a denied account has
 * no way to clear its own cookie and sign in as someone else.
 *
 * An account that arrived through HNS SSO but has no role here yet (`Pending`)
 * is told exactly that, so it does not read as a fault.
 */
export default async function UnauthorizedPage() {
  const session = await getSession();
  const pending = session?.role === "Pending";
  const portalUrl = ssoEnv()?.issuer ?? "https://auth.hnsitcenter.id";

  return (
    // Cream rather than the old near-black screen, which matched nothing
    // else in the app. Same words, same two ways out.
    <AuthShell tone="plain" className="items-center text-center">
      {pending ? (
        <>
          <Clock aria-hidden="true" className="size-10 text-tone-amber-fg" />
          <div className="flex flex-col gap-3">
            <h1 className="text-2xl font-bold text-tone-amber-fg">Menunggu Penetapan Role</h1>
            <p className="text-muted-foreground">
              Halo {session?.name}, akun Anda sudah terdaftar melalui SSO HNS, tetapi belum
              diberi role di aplikasi ini. Minta admin HNS Ticketing Service menetapkan role
              Anda, lalu masuk lagi.
            </p>
          </div>
        </>
      ) : (
        <>
          <ShieldX aria-hidden="true" className="size-10 text-destructive" />
          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-bold text-destructive">Access Denied</h1>
            <p className="text-muted-foreground">
              For now you don&apos;t have any rights to this page. If you believe this is a
              mistake, please contact the administrator.
            </p>
          </div>
        </>
      )}

      <div className="flex w-full flex-col gap-3">
        <form action={logoutAction}>
          <Button type="submit" size="lg" className="w-full">
            <LogOut aria-hidden="true" />
            Sign Out
          </Button>
        </form>

        <Link href={portalUrl} className={buttonVariants({ variant: "outline", size: "lg", className: "w-full bg-card" })}>
          Back to Portal
        </Link>
      </div>
    </AuthShell>
  );
}
