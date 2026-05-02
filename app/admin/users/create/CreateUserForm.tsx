"use client";

import { useState, useTransition } from "react";
import { createUserAction } from "@/app/actions/admin";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Eye, EyeOff } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CreateUserForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState("Customer");
  const [showPw, setShowPw] = useState(false);
  const [workDays, setWorkDays] = useState<string[]>([]);

  const toggleDay = (day: string) =>
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );

  const submit = (formData: FormData) => {
    formData.append("work_days", JSON.stringify(workDays));
    startTransition(async () => {
      const result = await createUserAction(formData);
      if (result?.error) toast.error(result.error);
      else {
        toast.success("User created!");
        router.push("/admin/users");
      }
    });
  };

  return (
    <form action={submit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="form-group">
          <label className="form-label">Full Name *</label>
          <input name="name" className="form-input" required placeholder="John Doe" />
        </div>
        <div className="form-group">
          <label className="form-label">Email *</label>
          <input name="email" type="email" className="form-input" required placeholder="user@example.com" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="form-group">
          <label className="form-label">Phone</label>
          <input name="phone_number" className="form-input" placeholder="+6281234567890" />
        </div>
        <div className="form-group">
          <label className="form-label">Role</label>
          <select name="role" className="form-input" value={role} onChange={(e) => setRole(e.target.value)}>
            {["Administrator", "Technician", "Sales", "Customer"].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Address</label>
        <textarea name="address" className="form-input" rows={2} placeholder="Full address" />
      </div>

      <div className="form-group">
        <label className="form-label">Password *</label>
        <div style={{ position: "relative" }}>
          <input
            name="password"
            type={showPw ? "text" : "password"}
            className="form-input"
            required
            placeholder="Min 8 characters"
            style={{ paddingRight: "2.75rem" }}
          />
          <button type="button" onClick={() => setShowPw(!showPw)}
            style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}>
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {/* Technician-specific */}
      {role === "Technician" && (
        <div className="card" style={{ background: "var(--cream)" }}>
          <h4 style={{ marginBottom: "1rem" }}>Technician Configuration</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div className="form-group">
              <label className="form-label">Shift</label>
              <select name="shift" className="form-input">
                <option value="">No shift</option>
                <option value="morning">Morning (09:00–18:00)</option>
                <option value="noon">Noon (12:00–22:00)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Max Points</label>
              <input name="max_points" type="number" className="form-input" defaultValue={7} min={1} max={20} />
            </div>
          </div>
          <div className="form-group" style={{ marginTop: "0.75rem" }}>
            <label className="form-label">Work Days</label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
              {DAYS.map((day) => (
                <button key={day} type="button" onClick={() => toggleDay(day)}
                  className="btn btn-sm"
                  style={{
                    background: workDays.includes(day) ? "var(--primary)" : "var(--white)",
                    color: workDays.includes(day) ? "#fff" : "var(--text-secondary)",
                    border: "1.5px solid",
                    borderColor: workDays.includes(day) ? "var(--primary)" : "var(--border)",
                  }}>
                  {day}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? <><span className="spinner spinner-sm" />Creating...</> : "Create User"}
        </button>
        <button type="button" onClick={() => router.back()} className="btn btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}
