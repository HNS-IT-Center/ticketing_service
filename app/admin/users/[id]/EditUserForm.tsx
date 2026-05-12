"use client";

import { useState, useTransition } from "react";
import { updateUserAction, deleteUserAction } from "@/app/actions/admin";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import { Trash2 } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface User {
  id: string;
  name: string;
  email: string;
  phone_number: string;
  address: string;
  role: string;
  shift: string | null;
  work_days: unknown;
  is_team_leader: boolean;
}

interface Workload {
  max_points: number;
}

export default function EditUserForm({
  user,
  workload,
}: {
  user: User;
  workload: Workload | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [role, setRole] = useState(user.role);
  const [isTeamLeader, setIsTeamLeader] = useState(user.is_team_leader);
  const [workDays, setWorkDays] = useState<string[]>(
    Array.isArray(user.work_days) ? (user.work_days as string[]) : []
  );

  const toggleDay = (day: string) => {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const save = (formData: FormData) => {
    formData.append("work_days", JSON.stringify(workDays));
    formData.append("is_team_leader", isTeamLeader ? "1" : "0");
    startTransition(async () => {
      const result = await updateUserAction(user.id, formData);
      if ((result as any)?.error) toast.error((result as any).error);
      else { toast.success("User updated!"); router.push("/admin/users"); }
    });
  };

  const confirmDelete = () => {
    startTransition(async () => {
      await deleteUserAction(user.id);
      toast.success("User deleted");
      router.push("/admin/users");
    });
  };

  return (
    <>
      <form action={save} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input name="name" className="form-input" defaultValue={user.name} required />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input name="email" type="email" className="form-input" defaultValue={user.email} required />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input name="phone_number" className="form-input" defaultValue={user.phone_number} />
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
          <textarea name="address" className="form-input" defaultValue={user.address} rows={2} />
        </div>

        {/* Technician-specific settings */}
        {role === "Technician" && (
          <div className="card" style={{ background: "var(--cream)" }}>
            <h4 style={{ marginBottom: "1rem" }}>Technician Configuration</h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">Shift</label>
                <select name="shift" className="form-input" defaultValue={user.shift || ""}>
                  <option value="">No shift</option>
                  <option value="morning">Morning (09:00–18:00)</option>
                  <option value="noon">Noon (12:00–22:00)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Max Points</label>
                <input name="max_points" type="number" className="form-input" defaultValue={workload?.max_points ?? 7} min={1} max={20} />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: "0.75rem" }}>
              <label className="form-label">Work Days</label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
                {DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className="btn btn-sm"
                    style={{
                      background: workDays.includes(day) ? "var(--primary)" : "var(--white)",
                      color: workDays.includes(day) ? "#fff" : "var(--text-secondary)",
                      border: "1.5px solid",
                      borderColor: workDays.includes(day) ? "var(--primary)" : "var(--border)",
                    }}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            {/* Team Leader flag */}
            <div style={{ marginTop: "0.75rem", padding: "0.75rem 1rem", background: "var(--white)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <input
                type="checkbox"
                id="is_team_leader"
                checked={isTeamLeader}
                onChange={(e) => setIsTeamLeader(e.target.checked)}
                style={{ width: "1rem", height: "1rem", cursor: "pointer" }}
              />
              <div>
                <label htmlFor="is_team_leader" style={{ fontWeight: 600, cursor: "pointer", fontSize: "0.875rem" }}>Team Leader</label>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  Team leaders are excluded from the leaderboard ranking but can still work on tickets.
                </p>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {isPending ? <><span className="spinner spinner-sm" />Saving...</> : "Save Changes"}
          </button>
          <button type="button" onClick={() => router.back()} className="btn btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="btn btn-danger"
            style={{ marginLeft: "auto" }}
          >
            <Trash2 size={16} /> Delete User
          </button>
        </div>
      </form>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete User?">
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
          Are you sure you want to delete <strong>{user.name}</strong>? This action cannot be undone.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={() => setDeleteOpen(false)}>Cancel</button>
          <button className="btn btn-danger" onClick={confirmDelete} disabled={isPending}>
            {isPending ? <span className="spinner spinner-sm" /> : "Delete"}
          </button>
        </div>
      </Modal>
    </>
  );
}
