"use client";

import { useActionState, useEffect } from "react";
import toast from "react-hot-toast";
import { useSearchParams } from "next/navigation";
import { loginAction, type FormState } from "@/app/actions/auth";
import { AlertCircle, Info, KeyRound, Loader2 } from "lucide-react";
import { AuthShell } from "@/components/app/AuthShell";
import { FormField } from "@/components/app/FormField";
import { PasswordInput } from "@/components/app/PasswordInput";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLoginOptions } from "./login-options";

export default function LoginPage() {
  const { ssoEnabled, localLogin } = useLoginOptions();
  const searchParams = useSearchParams();
  const ended = searchParams.get("ended") === "1";
  const ssoOff = searchParams.get("sso") === "off";

  // Sent here because the login ran out mid-task: whatever the page left behind
  // ("Pengiriman gagal…") is not the story — the notice below is.
  useEffect(() => {
    if (ended) toast.dismiss();
  }, [ended]);

  return (
    <AuthShell>
      {/* Logo */}
      <div className="flex flex-col items-center gap-1.5 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-hns.jpg" alt="HNS IT Center" className="mb-3 block h-20 w-40 rounded-lg object-contain" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome back</h1>
        <p className="text-[0.9375rem] text-muted-foreground">Sign in to your HNS IT Center account</p>
      </div>

      {(ended || ssoOff) && (
        <div className="flex flex-col gap-2">
          {ended && <Notice>Sesi Anda telah berakhir. Silakan masuk lagi.</Notice>}
          {ssoOff && <Notice>Masuk dengan SSO HNS belum diaktifkan di aplikasi ini.</Notice>}
        </div>
      )}

      {ssoEnabled ? (
        <div className="flex flex-col gap-4">
          {/* A route handler that redirects to SSO: a full page navigation, not <Link>. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/auth/sso/login" className={buttonVariants({ size: "lg", className: "w-full" })}>
            <KeyRound aria-hidden="true" /> Masuk dengan SSO HNS
          </a>

          {localLogin === "all" ? (
            <>
              <Divider label="atau masuk dengan password" />
              <PasswordForm />
            </>
          ) : (
            <details className="group rounded-lg border border-border">
              <summary className="flex min-h-11 cursor-pointer list-none items-center px-4 text-sm font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
                Login darurat (khusus admin)
              </summary>
              <div className="border-t border-border p-4">
                <PasswordForm />
              </div>
            </details>
          )}
        </div>
      ) : (
        <PasswordForm primary />
      )}

      <p className="text-center text-[0.9375rem] text-muted-foreground">Staff login only.</p>
    </AuthShell>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <Alert variant="info">
      <Info aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

function Divider({ label }: { label: string }) {
  // The label sat on var(--background), which turned cream with the UI-1
  // tokens and showed as a strip on the white card; it sits on the card now.
  return (
    <div className="relative flex items-center justify-center">
      <span aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t border-border" />
      <span className="relative bg-card px-2 text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

/** `primary` when the password form is the only way in, i.e. SSO is not configured. */
function PasswordForm({ primary = false }: { primary?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    loginAction,
    undefined
  );
  const emailError = state?.errors?.email?.[0];
  const passwordError = state?.errors?.password?.[0];

  return (
    <div className="flex flex-col gap-5">
      {state?.message && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <form action={action} className="flex flex-col gap-4">
        <FormField
          label="Email address"
          htmlFor="email"
          error={emailError && <FieldError>{emailError}</FieldError>}
        >
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            aria-invalid={emailError ? true : undefined}
            className="bg-card"
          />
        </FormField>

        <FormField
          label="Password"
          htmlFor="password"
          error={passwordError && <FieldError>{passwordError}</FieldError>}
        >
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            minLength={6}
            placeholder="Your password"
            aria-invalid={passwordError ? true : undefined}
            className="bg-card"
          />
        </FormField>

        <label htmlFor="rememberMe" className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-muted-foreground select-none md:min-h-9">
          <input
            type="checkbox"
            id="rememberMe"
            name="rememberMe"
            defaultChecked={state?.rememberMe}
            className="size-5 accent-primary md:size-4"
          />
          Remember me
        </label>

        <Button type="submit" size="lg" variant={primary ? "default" : "outline"} disabled={pending} className={cn("w-full", !primary && "bg-card")}>
          {pending ? (
            <>
              <Loader2 aria-hidden="true" className="animate-spin" />
              Signing in...
            </>
          ) : (
            "Sign In"
          )}
        </Button>
      </form>
    </div>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      <AlertCircle aria-hidden="true" className="size-3" />
      {children}
    </span>
  );
}
