"use client";

import { useState, useTransition } from "react";
import { changePasswordAction } from "@/app/actions/profile";
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword]   = useState("");
  const [newPassword, setNewPassword]           = useState("");
  const [confirmPassword, setConfirmPassword]   = useState("");
  const [showCurrent, setShowCurrent]           = useState(false);
  const [showNew, setShowNew]                   = useState(false);
  const [showConfirm, setShowConfirm]           = useState(false);
  const [error, setError]                       = useState<string | null>(null);
  const [success, setSuccess]                   = useState(false);
  const [isPending, startTransition]            = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await changePasswordAction({
        currentPassword,
        newPassword,
        confirmPassword,
      });

      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
      } else {
        setSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        toast.success("Password changed successfully!");
      }
    });
  };

  const strengthColor = () => {
    if (newPassword.length === 0) return "var(--border)";
    if (newPassword.length < 8)  return "#ef4444";
    if (newPassword.length < 12) return "#f59e0b";
    return "#16a34a";
  };
  const strengthLabel = () => {
    if (newPassword.length === 0) return "";
    if (newPassword.length < 8)  return "Too short";
    if (newPassword.length < 12) return "Acceptable";
    return "Strong";
  };

  const inputStyle = { paddingRight: "2.75rem" };
  const toggleBtnStyle = {
    position: "absolute" as const, right: "0.75rem", top: "50%",
    transform: "translateY(-50%)", background: "none",
    border: "none", cursor: "pointer", color: "var(--text-muted)",
    display: "flex", alignItems: "center", padding: 0,
  };

  return (
    <div className="card" style={{ padding: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
        <Lock size={18} style={{ color: "var(--primary)" }} />
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>Change Password</h2>
      </div>

      {success && (
        <div style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          background: "#f0fdf4", border: "1px solid #bbf7d0",
          borderRadius: "var(--radius-md)", padding: "0.75rem 1rem",
          color: "#15803d", fontSize: "0.875rem", fontWeight: 500,
          marginBottom: "1rem",
        }}>
          <CheckCircle size={16} /> Password changed successfully!
        </div>
      )}

      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          background: "#fff1f2", border: "1px solid #fecdd3",
          borderRadius: "var(--radius-md)", padding: "0.75rem 1rem",
          color: "#be123c", fontSize: "0.875rem", fontWeight: 500,
          marginBottom: "1rem",
        }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div className="form-group">
          <label className="form-label" htmlFor="current-password">Current Password</label>
          <div style={{ position: "relative" }}>
            <input
              id="current-password"
              type={showCurrent ? "text" : "password"}
              className="form-input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              style={inputStyle}
              autoComplete="off"
            />
            <button type="button" onClick={() => setShowCurrent(v => !v)} style={toggleBtnStyle} tabIndex={-1}>
              {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="new-password">New Password</label>
          <div style={{ position: "relative" }}>
            <input
              id="new-password"
              type={showNew ? "text" : "password"}
              className="form-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={inputStyle}
              autoComplete="off"
            />
            <button type="button" onClick={() => setShowNew(v => !v)} style={toggleBtnStyle} tabIndex={-1}>
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Password strength bar */}
        {newPassword.length > 0 && (
          <div style={{ marginTop: "-0.5rem" }}>
            <div style={{ height: "4px", borderRadius: "999px", background: "var(--border)", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: "999px",
                width: `${Math.min((newPassword.length / 16) * 100, 100)}%`,
                background: strengthColor(), transition: "all 0.3s",
              }} />
            </div>
            <span style={{ fontSize: "0.7rem", color: strengthColor(), fontWeight: 600, marginTop: "0.25rem", display: "block" }}>
              {strengthLabel()}
            </span>
          </div>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="confirm-password">Confirm New Password</label>
          <div style={{ position: "relative" }}>
            <input
              id="confirm-password"
              type={showConfirm ? "text" : "password"}
              className="form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={inputStyle}
              autoComplete="off"
            />
            <button type="button" onClick={() => setShowConfirm(v => !v)} style={toggleBtnStyle} tabIndex={-1}>
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Match indicator */}
        {confirmPassword.length > 0 && (
          <p style={{
            fontSize: "0.75rem", fontWeight: 600, marginTop: "-0.5rem",
            color: newPassword === confirmPassword ? "#16a34a" : "#ef4444",
          }}>
            {newPassword === confirmPassword ? "✓ Passwords match" : "✗ Passwords do not match"}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || !currentPassword || !newPassword || !confirmPassword}
          className="btn btn-primary"
          style={{ marginTop: "0.25rem" }}
        >
          {isPending ? <><span className="spinner spinner-sm" /> Saving...</> : "Change Password"}
        </button>
      </form>
    </div>
  );
}
