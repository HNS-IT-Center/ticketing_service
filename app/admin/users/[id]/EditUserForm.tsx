"use client";

import { useState, useTransition } from "react";
import { updateUserAction, checkUserDeletionAction, deactivateUserAction } from "@/app/actions/admin";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import { AlertTriangle, Trash2, UserX } from "lucide-react";

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

interface ActiveTicket {
  id: string;
  ticket_code: string;
  ticket_type: string;
  status: string;
}

interface Technician {
  id: string;
  name: string;
}

// Modal steps
type ModalStep = "idle" | "checking" | "no_active" | "has_active";

export default function EditUserForm({ user }: { user: User }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modalStep, setModalStep] = useState<ModalStep>("idle");
  const [activeTickets, setActiveTickets] = useState<ActiveTicket[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTechId, setSelectedTechId] = useState<string>("");
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

  // Initiate the deletion flow: check for active tickets first
  const handleDeleteClick = () => {
    setModalStep("checking");
    startTransition(async () => {
      const { activeTickets: tickets } = await checkUserDeletionAction(user.id);

      if (tickets.length === 0) {
        // No active tickets — proceed straight to simple confirm
        setActiveTickets([]);
        setModalStep("no_active");
      } else {
        // Has active tickets — need reassignment step
        setActiveTickets(tickets);
        // Fetch available technicians for the dropdown
        const res = await fetch(`/api/technicians?exclude=${user.id}`);
        const data = await res.json();
        setTechnicians(data.technicians ?? []);
        setSelectedTechId("");
        setModalStep("has_active");
      }
    });
  };

  const closeModal = () => {
    setModalStep("idle");
    setActiveTickets([]);
    setTechnicians([]);
    setSelectedTechId("");
  };

  // Final confirmation — called from either modal step
  const confirmDeactivate = (reassignTo?: string) => {
    startTransition(async () => {
      const result = await deactivateUserAction(user.id, reassignTo || null);
      if ((result as any)?.error) {
        toast.error((result as any).error);
        closeModal();
        return;
      }
      toast.success(`${user.name} has been deactivated.`);
      router.push("/admin/users");
    });
  };

  const statusLabel: Record<string, string> = {
    waiting: "Waiting",
    on_progress: "In Progress",
  };

  const typeLabel: Record<string, string> = {
    service: "Service",
    warranty_claim: "Warranty",
    pc_build: "PC Build",
    cleaning: "Cleaning",
    upgrade: "Upgrade",
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
            onClick={handleDeleteClick}
            className="btn btn-danger"
            style={{ marginLeft: "auto" }}
            disabled={isPending}
          >
            <UserX size={16} /> Deactivate User
          </button>
        </div>
      </form>

      {/* ── Modal: Checking ─────────────────────────────────────── */}
      <Modal open={modalStep === "checking"} onClose={closeModal} title="Checking Active Tickets…">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", padding: "1.5rem 0" }}>
          <span className="spinner" style={{ width: "2rem", height: "2rem" }} />
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            Checking if {user.name} has any active tickets…
          </p>
        </div>
      </Modal>

      {/* ── Modal: No Active Tickets ─────────────────────────────── */}
      <Modal open={modalStep === "no_active"} onClose={closeModal} title="Deactivate User?">
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", marginBottom: "1.25rem" }}>
          <UserX size={20} style={{ color: "var(--danger)", flexShrink: 0, marginTop: "2px" }} />
          <p style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
            Are you sure you want to deactivate <strong>{user.name}</strong>?
            Their account will be disabled and they will no longer be able to log in.
            All historical data (tickets, logs, messages) will be preserved.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={closeModal} disabled={isPending}>Cancel</button>
          <button
            className="btn btn-danger"
            onClick={() => confirmDeactivate()}
            disabled={isPending}
          >
            {isPending ? <span className="spinner spinner-sm" /> : <><Trash2 size={14} /> Confirm Deactivate</>}
          </button>
        </div>
      </Modal>

      {/* ── Modal: Has Active Tickets — Reassignment Required ────── */}
      <Modal open={modalStep === "has_active"} onClose={closeModal} title="Active Tickets Must Be Reassigned">
        {/* Warning banner */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: "0.75rem",
          background: "rgba(245, 158, 11, 0.08)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
          borderRadius: "var(--radius-md)",
          padding: "0.875rem 1rem",
          marginBottom: "1.25rem",
        }}>
          <AlertTriangle size={18} style={{ color: "#d97706", flexShrink: 0, marginTop: "2px" }} />
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            <strong>{user.name}</strong> has{" "}
            <strong>{activeTickets.length} active ticket{activeTickets.length > 1 ? "s" : ""}</strong>{" "}
            that must be transferred to another technician before this account can be deactivated.
          </p>
        </div>

        {/* Active tickets list */}
        <div style={{ marginBottom: "1.25rem" }}>
          <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Active Tickets
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", maxHeight: "160px", overflowY: "auto" }}>
            {activeTickets.map((t) => (
              <div key={t.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0.5rem 0.75rem",
                background: "var(--bg-secondary, #f8f8f8)",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.875rem",
              }}>
                <span style={{ fontWeight: 600, fontFamily: "monospace" }}>#{t.ticket_code}</span>
                <span style={{ color: "var(--text-muted)" }}>{typeLabel[t.ticket_type] ?? t.ticket_type}</span>
                <span style={{
                  fontSize: "0.75rem", fontWeight: 600,
                  color: t.status === "on_progress" ? "var(--primary)" : "var(--text-secondary)",
                }}>
                  {statusLabel[t.status] ?? t.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Reassignment dropdown */}
        <div className="form-group" style={{ marginBottom: "1.25rem" }}>
          <label className="form-label">Transfer all active tickets to:</label>
          {technicians.length === 0 ? (
            <div style={{
              padding: "0.75rem 1rem",
              background: "rgba(239, 68, 68, 0.06)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              borderRadius: "var(--radius-md)",
              fontSize: "0.875rem",
              color: "#dc2626",
            }}>
              ⚠️ No other active technicians found. Please create another technician account before deactivating this user.
            </div>
          ) : (
            <select
              className="form-input"
              value={selectedTechId}
              onChange={(e) => setSelectedTechId(e.target.value)}
            >
              <option value="">— Select a technician —</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
        </div>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={closeModal} disabled={isPending}>Cancel</button>
          <button
            className="btn btn-danger"
            onClick={() => confirmDeactivate(selectedTechId)}
            disabled={isPending || !selectedTechId || technicians.length === 0}
          >
            {isPending
              ? <span className="spinner spinner-sm" />
              : <><Trash2 size={14} /> Reassign &amp; Deactivate</>}
          </button>
        </div>
      </Modal>
    </>
  );
}
