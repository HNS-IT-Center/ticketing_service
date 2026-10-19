"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction, type FormState } from "@/app/actions/auth";
import { AlertCircle, Eye, EyeOff, Info, KeyRound } from "lucide-react";
import { useLoginOptions } from "./login-options";

export default function LoginPage() {
  const { ssoEnabled, localLogin } = useLoginOptions();
  const searchParams = useSearchParams();
  const ended = searchParams.get("ended") === "1";
  const ssoOff = searchParams.get("sso") === "off";

  return (
    <div className="auth-container">
      <div className="auth-card">
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.25rem" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-hns.jpg"
              alt="HNS IT Center"
              style={{ width: "160px", height: "80px", objectFit: "contain", borderRadius: "0.5rem", display: "block" }}
            />
          </div>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.375rem" }}>
            Welcome back
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9375rem" }}>
            Sign in to your HNS IT Center account
          </p>
        </div>

        {ended && <Notice>Sesi Anda telah berakhir. Silakan masuk lagi.</Notice>}
        {ssoOff && <Notice>Masuk dengan SSO HNS belum diaktifkan di aplikasi ini.</Notice>}

        {ssoEnabled ? (
          <div className="flex flex-col gap-4">
            {/* A route handler that redirects to SSO: a full page navigation, not <Link>. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/auth/sso/login" className="btn btn-primary btn-lg flex items-center justify-center gap-2" style={{ width: "100%" }}>
              <KeyRound size={18} /> Masuk dengan SSO HNS
            </a>

            {localLogin === "all" ? (
              <>
                <Divider label="atau masuk dengan password" />
                <PasswordForm />
              </>
            ) : (
              <details className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
                <summary className="cursor-pointer text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                  Login darurat (khusus admin)
                </summary>
                <div className="pt-4">
                  <PasswordForm />
                </div>
              </details>
            )}
          </div>
        ) : (
          <PasswordForm primary />
        )}

        <p
          style={{
            textAlign: "center",
            marginTop: "1.5rem",
            color: "var(--text-muted)",
            fontSize: "0.9375rem",
          }}
        >
          Staff login only.
        </p>
      </div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm"
      style={{ background: "#eff6ff", borderColor: "#bfdbfe", color: "#1e40af" }}
    >
      <Info size={16} />
      {children}
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center" }}>
        <div style={{ width: "100%", borderTop: "1px solid #e5e7eb" }}></div>
      </div>
      <div style={{ position: "relative", display: "flex", justifyContent: "center", fontSize: "0.875rem" }}>
        <span style={{ padding: "0 0.5rem", background: "var(--background, #fff)", color: "var(--text-muted, #6b7280)" }}>
          {label}
        </span>
      </div>
    </div>
  );
}

/** `primary` when the password form is the only way in, i.e. SSO is not configured. */
function PasswordForm({ primary = false }: { primary?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    loginAction,
    undefined
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <>
      {state?.message && (
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #fca5a5",
            borderRadius: "var(--radius-md)",
            padding: "0.75rem 1rem",
            marginBottom: "1.25rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            color: "#991b1b",
            fontSize: "0.9rem",
          }}
        >
          <AlertCircle size={16} />
          {state.message}
        </div>
      )}

      <form
        action={action}
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        <div className="form-group">
          <label htmlFor="email" className="form-label">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={`form-input ${state?.errors?.email ? "error" : ""}`}
            placeholder="you@example.com"
          />
          {state?.errors?.email && (
            <span className="form-error">
              <AlertCircle size={12} />
              {state.errors.email[0]}
            </span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="password" className="form-label">Password</label>
          <div style={{ position: "relative" }}>
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              minLength={6}
              className={`form-input ${state?.errors?.password ? "error" : ""}`}
              placeholder="Your password"
              style={{ paddingRight: "2.75rem" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: "absolute",
                right: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                padding: 0,
                display: "flex",
                alignItems: "center",
              }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {state?.errors?.password && (
            <span className="form-error">
              <AlertCircle size={12} />
              {state.errors.password[0]}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "-0.25rem", marginBottom: "0.5rem" }}>
          <input
            type="checkbox"
            id="rememberMe"
            name="rememberMe"
            defaultChecked={state?.rememberMe}
            style={{ width: "1rem", height: "1rem", cursor: "pointer", accentColor: "var(--primary)" }}
          />
          <label htmlFor="rememberMe" style={{ fontSize: "0.875rem", color: "var(--text-secondary)", cursor: "pointer", userSelect: "none" }}>
            Remember me
          </label>
        </div>

        <button
          type="submit"
          disabled={pending}
          className={primary ? "btn btn-primary btn-lg" : "btn btn-outline btn-lg"}
          style={{ width: "100%", marginTop: "0.5rem" }}
        >
          {pending ? (
            <>
              <span className="spinner spinner-sm" />
              Signing in...
            </>
          ) : (
            "Sign In"
          )}
        </button>
      </form>
    </>
  );
}
