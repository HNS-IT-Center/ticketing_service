"use client";

import { useState, useTransition } from "react";
import { snapshotLeaderboardAction } from "@/app/actions/admin";
import Modal from "@/components/ui/Modal";
import { Camera } from "lucide-react";
import toast from "react-hot-toast";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function LeaderboardSnapshot() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const snapshot = () => {
    startTransition(async () => {
      const result = await snapshotLeaderboardAction(month, year);
      if (result?.success) {
        toast.success(`Leaderboard snapshot created for ${MONTHS[month - 1]} ${year}`);
        setOpen(false);
      }
    });
  };

  return (
    <>
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>
        <Camera size={16} /> Snapshot Leaderboard
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Create Leaderboard Snapshot">
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
          This will create a monthly leaderboard snapshot based on current technician performance.
          Existing data for the same month/year will be replaced.
        </p>

        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Month</label>
            <select className="form-input" value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Year</label>
            <select className="form-input" value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
              {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={snapshot} disabled={isPending}>
            {isPending ? <><span className="spinner spinner-sm" />Creating...</> : "Create Snapshot"}
          </button>
        </div>
      </Modal>
    </>
  );
}
