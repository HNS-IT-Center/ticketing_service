"use client";

import { useActionState, useState } from "react";
import { registerAction, type FormState } from "@/app/actions/auth";
import { AlertCircle, Eye, EyeOff, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function RegisterPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    registerAction,
    undefined
  );
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="auth-container">
      <div className="auth-card" style={{ maxWidth: "520px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.25rem" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-hns.jpg"
              alt="HNS IT Center"
              style={{ width: "160px", height: "80px", objectFit: "contain", borderRadius: "0.5rem", display: "block" }}
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
          {/* Full Name */}
          <div className="form-group">
            <label htmlFor="name" className="form-label">Full Name</label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              minLength={2}
              className={`form-input ${state?.errors?.name ? "error" : ""}`}
              placeholder="John Doe"
            />
            {state?.errors?.name && (
              <span className="form-error"><AlertCircle size={12} />{state.errors.name[0]}</span>
            )}
          </div>

          {/* Email */}
          <div className="form-group">
            <label htmlFor="email" className="form-label">Email Address</label>
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
              <span className="form-error"><AlertCircle size={12} />{state.errors.email[0]}</span>
            )}
          </div>

          {/* Phone with +62 prefix */}
          <div className="form-group">
            <label htmlFor="phone_number" className="form-label">Phone Number</label>
            <div style={{ display: "flex", alignItems: "stretch" }}>
              <span
                style={{
                  padding: "0.625rem 0.75rem",
                  background: "var(--cream-dark)",
                  border: "1.5px solid var(--border)",
                  borderRight: "none",
                  borderRadius: "var(--radius-md) 0 0 var(--radius-md)",
                  fontSize: "0.9375rem",
                  color: "var(--text-secondary)",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                +62
              </span>
              {/* Hidden field that submits the full +62 number */}
              <input type="hidden" name="phone_number" value={`+62${phone}`} />
              <input
                id="phone_number"
                type="tel"
                autoComplete="tel"
                required
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                className={`form-input ${state?.errors?.phone_number ? "error" : ""}`}
                placeholder="81234567890"
                style={{ borderRadius: "0 var(--radius-md) var(--radius-md) 0" }}
                minLength={9}
                maxLength={13}
              />
            </div>
            {state?.errors?.phone_number && (
              <span className="form-error"><AlertCircle size={12} />{state.errors.phone_number[0]}</span>
            )}
          </div>

          {/* Address */}
          <div className="form-group">
            <label htmlFor="address" className="form-label">Address</label>
            <textarea
              id="address"
              name="address"
              required
              className={`form-input ${state?.errors?.address ? "error" : ""}`}
              placeholder="Your full address"
              rows={2}
            />
            {state?.errors?.address && (
              <span className="form-error"><AlertCircle size={12} />{state.errors.address[0]}</span>
            )}
          </div>

          {/* Password */}
          <div className="form-group">
            <label htmlFor="password" className="form-label">Password</label>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
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

          {/* Terms & Conditions checkbox */}
          <label
            htmlFor="terms"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.625rem",
              cursor: "pointer",
              padding: "0.75rem",
              background: agreed ? "rgba(22,70,157,0.04)" : "var(--cream)",
              border: `1.5px solid ${agreed ? "var(--primary)" : "var(--border)"}`,
              borderRadius: "var(--radius-md)",
              transition: "all 0.2s",
            }}
          >
            <input
              id="terms"
              type="checkbox"
              required
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ marginTop: "2px", width: "1rem", height: "1rem", flexShrink: 0, accentColor: "var(--primary)" }}
            />
            <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              <ShieldCheck size={13} style={{ display: "inline", marginRight: "4px", color: "var(--primary)", verticalAlign: "text-bottom" }} />
              I agree to the{" "}
              <span style={{ fontWeight: 600, color: "var(--primary)" }}>Terms of Service</span> and{" "}
              <span style={{ fontWeight: 600, color: "var(--primary)" }}>Privacy Policy</span> of HNS IT Center.
              My data will be used to manage service tickets and improve the service experience.
            </span>
          </label>

          <button
            type="submit"
            disabled={pending || !agreed}
            className="btn btn-primary btn-lg"
            style={{ width: "100%", marginTop: "0.25rem" }}
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
