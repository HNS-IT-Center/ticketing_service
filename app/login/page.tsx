"use client";

import { useActionState, useState } from "react";
import { loginAction, type FormState } from "@/app/actions/auth";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import NativeSSOLoginButton from "@/components/NativeSSOLoginButton";

export default function LoginPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    loginAction,
    undefined
  );
  const [showPassword, setShowPassword] = useState(false);

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
            <input type="checkbox" id="rememberMe" name="rememberMe" style={{ width: "auto", cursor: "pointer" }} />
            <label htmlFor="rememberMe" style={{ fontSize: "0.875rem", color: "var(--text-secondary)", cursor: "pointer", userSelect: "none" }}>
              Remember me
            </label>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="btn btn-primary btn-lg"
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

        <div style={{ position: "relative", marginTop: "1.5rem", marginBottom: "1.5rem" }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center" }}>
            <div style={{ width: "100%", borderTop: "1px solid var(--border)", borderColor: "#e5e7eb" }}></div>
          </div>
          <div style={{ position: "relative", display: "flex", justifyContent: "center", fontSize: "0.875rem" }}>
            <span style={{ padding: "0 0.5rem", background: "var(--background, #fff)", color: "var(--text-muted, #6b7280)" }}>
              Or sign in with
            </span>
          </div>
        </div>

        <NativeSSOLoginButton />

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
