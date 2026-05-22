"use client";

import { useState, useTransition } from "react";
import { assignLeaveAction, overrideShiftAction } from "@/app/actions/schedule";
import toast from "react-hot-toast";
import { Calendar, UserX, UserCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type Technician = {
  id: string;
  name: string;
  shift: string | null;
  leaves: any[];
  overridden_shifts: any[];
};

export default function ScheduleManager({ technicians }: { technicians: Technician[] }) {
  const [isPending, startTransition] = useTransition();
  const [selectedTech, setSelectedTech] = useState<Technician | null>(null);
  const [activeTab, setActiveTab] = useState<"leave" | "override">("leave");

  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [overrideTechId, setOverrideTechId] = useState("");
  const [shift, setShift] = useState<"morning" | "noon">("morning");

  const closeDialog = () => {
    setSelectedTech(null);
    setDate("");
    setReason("");
    setOverrideTechId("");
  };

  const handleLeaveSubmit = () => {
    if (!selectedTech || !date) return toast.error("Date is required");
    startTransition(async () => {
      const fd = new FormData();
      fd.append("technician_id", selectedTech.id);
      fd.append("date", date);
      if (reason) fd.append("reason", reason);
      const res = await assignLeaveAction(fd);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Leave assigned");
        closeDialog();
      }
    });
  };

  const handleOverrideSubmit = () => {
    if (!selectedTech || !date || !overrideTechId) return toast.error("All fields required");
    startTransition(async () => {
      const fd = new FormData();
      fd.append("original_tech_id", selectedTech.id);
      fd.append("override_tech_id", overrideTechId);
      fd.append("date", date);
      fd.append("shift", shift);
      const res = await overrideShiftAction(fd);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Shift overridden");
        closeDialog();
      }
    });
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {technicians.map((t) => (
          <div key={t.id} className="card flex flex-col gap-2">
            <h3 className="font-bold text-lg">{t.name}</h3>
            <p className="text-sm text-gray-500">Default Shift: {t.shift || "Not set"}</p>
            
            {t.leaves.length > 0 && (
              <div className="mt-2 p-2 bg-red-50 text-red-800 rounded text-sm">
                <strong>Upcoming Leaves:</strong>
                <ul className="list-disc pl-4 mt-1">
                  {t.leaves.map((l: any) => (
                    <li key={l.id}>{new Date(l.date).toLocaleDateString()} {l.reason && `- ${l.reason}`}</li>
                  ))}
                </ul>
              </div>
            )}

            {t.overridden_shifts.length > 0 && (
              <div className="mt-2 p-2 bg-yellow-50 text-yellow-800 rounded text-sm">
                <strong>Shift Overrides:</strong>
                <ul className="list-disc pl-4 mt-1">
                  {t.overridden_shifts.map((o: any) => (
                    <li key={o.id}>{new Date(o.date).toLocaleDateString()} - Covered by another tech</li>
                  ))}
                </ul>
              </div>
            )}

            <button type="button" className="btn btn-outline mt-4 flex items-center justify-center gap-2" onClick={() => setSelectedTech(t)}>
              <Calendar className="h-4 w-4" /> Manage Schedule
            </button>
          </div>
        ))}
      </div>

      <Dialog open={!!selectedTech} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Schedule: {selectedTech?.name}</DialogTitle>
          </DialogHeader>

          <div className="flex gap-2 border-b pb-2 mb-4">
            <button type="button" className={`btn flex items-center gap-2 ${activeTab === "leave" ? "btn-primary" : "btn-ghost"}`} onClick={() => setActiveTab("leave")}>
              <UserX className="h-4 w-4" /> Assign Leave
            </button>
            <button type="button" className={`btn flex items-center gap-2 ${activeTab === "override" ? "btn-primary" : "btn-ghost"}`} onClick={() => setActiveTab("override")}>
              <UserCheck className="h-4 w-4" /> Override Shift
            </button>
          </div>

          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label>Date *</Label>
              <input type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            {activeTab === "leave" ? (
              <div className="flex flex-col gap-2">
                <Label>Reason (Optional)</Label>
                <input type="text" className="form-input" placeholder="e.g., Sick, Vacation" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <Label>Covering Technician *</Label>
                  <select className="form-input" value={overrideTechId} onChange={(e) => setOverrideTechId(e.target.value)}>
                    <option value="">Select Technician</option>
                    {technicians.filter((t) => t.id !== selectedTech?.id).map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Shift *</Label>
                  <select className="form-input" value={shift} onChange={(e) => setShift(e.target.value as any)}>
                    <option value="morning">Morning (10:00 - 19:00)</option>
                    <option value="noon">Noon (13:00 - 22:00)</option>
                  </select>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <button type="button" className="btn btn-ghost" onClick={closeDialog}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={activeTab === "leave" ? handleLeaveSubmit : handleOverrideSubmit} disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
