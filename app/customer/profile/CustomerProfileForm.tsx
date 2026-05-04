"use client";

import { useState, useTransition } from "react";
import { updateProfileAction } from "@/app/actions/customer";
import { AlertCircle, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";

export default function CustomerProfileForm({
  userId,
  initialName,
  initialPhone,
  initialAddress,
}: {
  userId: string;
  initialName: string;
  initialPhone: string;
  initialAddress: string;
}) {
  // Phone: strip the +62 prefix for the input box
  const stripPrefix = (p: string) =>
    p.startsWith("+62") ? p.slice(3) : p;

  const [name, setName]       = useState(initialName);
  const [phone, setPhone]     = useState(stripPrefix(initialPhone));
  const [address, setAddress] = useState(initialAddress);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    startTransition(async () => {
      const result = await updateProfileAction({ userId, name, phone: `+62${phone}`, address });
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Profile updated!");
        setSaved(true);
      }
    });
  };

  return (
    <div className="card">
      <h2 className="text-base font-bold text-gray-700 mb-4">Edit Profile</h2>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div className="form-group">
          <label className="form-label">Full Name</label>
          <input
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Phone Number</label>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{
              padding: "0.625rem 0.75rem",
              background: "var(--cream-dark)",
              border: "1.5px solid var(--border)",
              borderRight: "none",
              borderRadius: "var(--radius-md) 0 0 var(--radius-md)",
              fontSize: "0.9375rem",
              color: "var(--text-secondary)",
              fontWeight: 600,
              lineHeight: "1.5",
              flexShrink: 0,
            }}>+62</span>
            <input
              className="form-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              inputMode="numeric"
              placeholder="81234567890"
              style={{ borderRadius: "0 var(--radius-md) var(--radius-md) 0" }}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Address</label>
          <textarea
            className="form-input"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Your address"
            rows={3}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.75rem" }}>
          {saved && (
            <span style={{ display: "flex", alignItems: "center", gap: "0.375rem", color: "#16a34a", fontSize: "0.875rem" }}>
              <CheckCircle size={15} /> Saved!
            </span>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isPending}
          >
            {isPending ? <><span className="spinner spinner-sm" /> Saving...</> : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
