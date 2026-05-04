"use client";

import { useActionState } from "react";
import { registerAction, type FormState } from "@/app/actions/auth";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

export default function RegisterPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    registerAction,
    undefined
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="auth-container">
      <div className="auth-card" style={{ maxWidth: "520px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.25rem" }}>
            <Image
              src="/Logo HNS IT Center.jpg"
              alt="HNS IT Center"
              width={160}
              height={80}
              style={{ objectFit: "contain", borderRadius: "0.5rem" }}
              priority
            />
          </div>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.375rem" }}>
            Create your account
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9375rem" }}>
            Join HNS IT Center to manage your service tickets
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
            <label htmlFor="name" className="form-label">Full Name</label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              className={`form-input ${state?.errors?.name ? "error" : ""}`}
              placeholder="John Doe"
            />
            {state?.errors?.name && (
              <span className="form-error"><AlertCircle size={12} />{state.errors.name[0]}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="email" className="form-label">Email Address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className={`form-input ${state?.errors?.email ? "error" : ""}`}
              placeholder="you@example.com"
            />
            {state?.errors?.email && (
              <span className="form-error"><AlertCircle size={12} />{state.errors.email[0]}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="phone_number" className="form-label">
              Phone Number
            </label>
            <input
              id="phone_number"
              name="phone_number"
              type="tel"
              autoComplete="tel"
              className={`form-input ${state?.errors?.phone_number ? "error" : ""}`}
              placeholder="+6281234567890"
            />
            {state?.errors?.phone_number && (
              <span className="form-error"><AlertCircle size={12} />{state.errors.phone_number[0]}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="address" className="form-label">Address</label>
            <textarea
              id="address"
              name="address"
              className={`form-input ${state?.errors?.address ? "error" : ""}`}
              placeholder="Your full address"
              rows={2}
            />
            {state?.errors?.address && (
              <span className="form-error"><AlertCircle size={12} />{state.errors.address[0]}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">Password</label>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                className={`form-input ${state?.errors?.password ? "error" : ""}`}
                placeholder="Min. 8 characters"
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
              <span className="form-error"><AlertCircle size={12} />{state.errors.password[0]}</span>
            )}
          </div>

          <button
            type="submit"
            disabled={pending}
            className="btn btn-primary btn-lg"
            style={{ width: "100%", marginTop: "0.5rem" }}
          >
            {pending ? (
              <><span className="spinner spinner-sm" />Creating account...</>
            ) : (
              "Create Account"
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
          Already have an account?{" "}
          <Link href="/login" style={{ fontWeight: 600 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
