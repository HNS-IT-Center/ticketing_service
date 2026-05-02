"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "@/app/actions/auth";
import { AlertCircle, Eye, EyeOff, Wrench } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

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
          <div
            style={{
              width: "3.5rem",
              height: "3.5rem",
              background: "linear-gradient(135deg, var(--primary), var(--primary-dark))",
              borderRadius: "1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1rem",
              boxShadow: "0 4px 16px rgba(22,70,157,0.3)",
            }}
          >
            <Wrench size={24} color="white" />
          </div>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.375rem" }}>
            Welcome back
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9375rem" }}>
            Sign in to your TechServe account
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

        <form action={action} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="form-group">
            <label htmlFor="email" className="form-label">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
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

        <p
          style={{
            textAlign: "center",
            marginTop: "1.5rem",
            color: "var(--text-muted)",
            fontSize: "0.9375rem",
          }}
        >
          Don&apos;t have an account?{" "}
          <Link href="/register" style={{ fontWeight: 600 }}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
