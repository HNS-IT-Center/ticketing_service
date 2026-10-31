"use client";

import { useState, useTransition } from "react";
import { assignLeaveAction, overrideShiftAction } from "@/app/actions/schedule";
import toast from "react-hot-toast";
import { Calendar, UserX, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Technician = {
  id: string;
  name: string;
  shift: string | null;
  leaves: { id: string; date: Date | string; reason: string | null }[];
  overridden_shifts: { id: string; date: Date | string }[];
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

  const selectClass =
    "h-11 w-full rounded-lg border border-input bg-card px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 md:text-sm";

  return (
    <div data-slot="schedule-manager">
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {technicians.map((t) => (
          <li key={t.id}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-lg font-bold">{t.name}</CardTitle>
                <CardDescription>Default Shift: {t.shift || "Not set"}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                {t.leaves.length > 0 && (
                  <div className="rounded-lg border border-tone-red-border bg-tone-red-bg p-3 text-sm text-tone-red-fg">
                    <strong>Upcoming Leaves:</strong>
                    <ul className="mt-1 list-disc pl-4">
                      {t.leaves.map((l) => (
                        <li key={l.id}>{new Date(l.date).toLocaleDateString()} {l.reason && `- ${l.reason}`}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {t.overridden_shifts.length > 0 && (
                  <div className="rounded-lg border border-tone-amber-border bg-tone-amber-bg p-3 text-sm text-tone-amber-fg">
                    <strong>Shift Overrides:</strong>
                    <ul className="mt-1 list-disc pl-4">
                      {t.overridden_shifts.map((o) => (
                        <li key={o.id}>{new Date(o.date).toLocaleDateString()} - Covered by another tech</li>
                      ))}
                    </ul>
                  </div>
                )}

                <Button variant="outline" className="mt-auto w-full" onClick={() => setSelectedTech(t)}>
                  <Calendar aria-hidden="true" /> Manage Schedule
                </Button>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <Dialog open={!!selectedTech} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">{`Manage Schedule: ${selectedTech?.name || ""}`}</DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "leave" | "override")}>
            <TabsList className="w-full">
              <TabsTrigger value="leave">
                <UserX aria-hidden="true" /> Assign Leave
              </TabsTrigger>
              <TabsTrigger value="override">
                <UserCheck aria-hidden="true" /> Override Shift
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="schedule-date">Date *</Label>
              <Input id="schedule-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            {activeTab === "leave" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="schedule-reason">Reason (Optional)</Label>
                <Input id="schedule-reason" type="text" placeholder="e.g., Sick, Vacation" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="schedule-cover">Covering Technician *</Label>
                  <select id="schedule-cover" className={selectClass} value={overrideTechId} onChange={(e) => setOverrideTechId(e.target.value)}>
                    <option value="">Select Technician</option>
                    {technicians.filter((t) => t.id !== selectedTech?.id).map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="schedule-shift">Shift *</Label>
                  <select id="schedule-shift" className={selectClass} value={shift} onChange={(e) => setShift(e.target.value as "morning" | "noon")}>
                    <option value="morning">Morning (10:00 - 19:00)</option>
                    <option value="noon">Noon (13:00 - 22:00)</option>
                  </select>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={activeTab === "leave" ? handleLeaveSubmit : handleOverrideSubmit} disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
