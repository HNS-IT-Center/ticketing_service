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
}

export default function AdminAssignPanel({
  ticketId,
  currentTechnicianId,
  currentSalesId,
  technicians,
  salesUsers,
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
      if (result?.error) toast.error(result.error as string);
      else toast.success("Assignment updated!");
    });
  };

  return (
    <div className="card">
      <h3 style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <UserCheck size={18} /> Assignment
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
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
