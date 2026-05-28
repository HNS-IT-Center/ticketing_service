"use client";

import { useState, useTransition } from "react";
import { adminAssignTicketAction } from "@/app/actions/admin";
import toast from "react-hot-toast";
import { UserCheck } from "lucide-react";

interface Props {
  ticketId: string;
  currentTechnicianId: string | null;
  currentSalesId: string | null;
  technicians: { id: string; name: string }[];
  salesUsers: { id: string; name: string }[];
  assignmentRequests?: { id: string; technician_id: string; technician: { name: string }; status: string }[];
}

export default function AdminAssignPanel({
  ticketId,
  currentTechnicianId,
  currentSalesId,
  technicians,
  salesUsers,
  assignmentRequests = [],
}: Props) {
  const [techId, setTechId] = useState(currentTechnicianId || "");
  const [saleId, setSaleId] = useState(currentSalesId || "");
  const [isPending, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      const result = await adminAssignTicketAction(
        ticketId,
        techId || null,
        saleId || null
      );
      if ((result as any)?.error) toast.error((result as any).error as string);
      else toast.success("Assignment updated!");
    });
  };

  const pendingRequests = assignmentRequests.filter(r => r.status === "pending" && r.technician_id !== currentTechnicianId);

  return (
    <div className="card" style={{ alignSelf: "flex-start", width: "100%" }}>
      <h3 style={{ marginBottom: "1rem" }}>
        Assignment
      </h3>

      {pendingRequests.length > 0 && (
        <div style={{ marginBottom: "1.5rem", padding: "0.75rem", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "0.5rem" }}>
          <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1e40af", marginBottom: "0.5rem" }}>
            Technician Requests:
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {pendingRequests.map(req => (
              <li key={req.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.875rem", color: "#1e3a8a" }}>
                <span>{req.technician.name} requested to be assigned.</span>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ background: "#3b82f6", color: "#fff", padding: "0.2rem 0.5rem" }}
                  onClick={() => setTechId(req.technician_id)}
                >
                  Select
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1rem" }}>
        <div className="form-group">
          <label className="form-label">Technician</label>
          <select
            className="form-input"
            value={techId}
            onChange={(e) => setTechId(e.target.value)}
          >
            <option value="">— Unassigned —</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Sales</label>
          <select
            className="form-input"
            value={saleId}
            onChange={(e) => setSaleId(e.target.value)}
          >
            <option value="">— Unassigned —</option>
            {salesUsers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>
      <button
        className="btn btn-primary btn-sm"
        onClick={save}
        disabled={isPending}
      >
        {isPending ? <><span className="spinner spinner-sm" />Saving...</> : "Save Assignment"}
      </button>
    </div>
  );
}
