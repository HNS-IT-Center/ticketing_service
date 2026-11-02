"use client";

import { useState, useTransition } from "react";
import { updateUserAction, checkUserDeletionAction, deactivateUserAction } from "@/app/actions/admin";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AlertTriangle, Loader2, Trash2, UserX } from "lucide-react";
import { FormField } from "@/components/app/FormField";
import { errorOf } from "@/lib/action-result";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

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
  is_head_technician: boolean;
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
  const [isHeadTechnician, setIsHeadTechnician] = useState(user.is_head_technician);
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
    formData.append("is_head_technician", isHeadTechnician ? "1" : "0");
    startTransition(async () => {
      const result = await updateUserAction(user.id, formData);
      const error = errorOf(result);
      if (error) toast.error(error);
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
      const error = errorOf(result);
      if (error) {
        toast.error(error);
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

  // A solid red for the irreversible step, as the legacy btn-danger was.
  const dangerSolid = "bg-destructive text-destructive-foreground hover:bg-destructive/90";

  const flagRow = (id: string, label: string, help: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label
      htmlFor={id}
      className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border bg-card px-4 py-3"
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primary"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-xs text-muted-foreground">{help}</span>
      </span>
    </label>
  );

  return (
    <>
      <form action={save} data-slot="edit-user-form" className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Full Name" htmlFor="eu-name">
                <Input id="eu-name" name="name" defaultValue={user.name} required />
              </FormField>
              <FormField label="Email" htmlFor="eu-email">
                <Input id="eu-email" name="email" type="email" defaultValue={user.email} required />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Phone" htmlFor="eu-phone">
                <Input id="eu-phone" name="phone_number" inputMode="tel" defaultValue={user.phone_number} />
              </FormField>
              <FormField label="Role" htmlFor="eu-role">
                <NativeSelect id="eu-role" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
                  {["Pending", "Administrator", "Technician", "Sales", "RMA", "Customer"].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </NativeSelect>
              </FormField>
            </div>

            <FormField label="Address" htmlFor="eu-address">
              <Textarea id="eu-address" name="address" defaultValue={user.address} rows={2} />
            </FormField>
          </CardContent>
        </Card>

        {/* Technician-specific settings */}
        {role === "Technician" && (
          <Card className="bg-muted/50">
            <CardHeader>
              <CardTitle className="font-semibold">Technician Configuration</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <FormField label="Shift" htmlFor="eu-shift" className="sm:max-w-xs">
                <NativeSelect id="eu-shift" name="shift" defaultValue={user.shift || ""}>
                  <option value="">No shift</option>
                  <option value="morning">Morning (09:00–18:00)</option>
                  <option value="noon">Noon (12:00–22:00)</option>
                </NativeSelect>
              </FormField>

              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-sm font-medium text-foreground">Work Days</legend>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((day) => {
                    const on = workDays.includes(day);
                    return (
                      <Button
                        key={day}
                        type="button"
                        size="sm"
                        variant={on ? "default" : "outline"}
                        aria-pressed={on}
                        onClick={() => toggleDay(day)}
                        className={on ? undefined : "bg-card"}
                      >
                        {day}
                      </Button>
                    );
                  })}
                </div>
              </fieldset>

              {/* Team Leader flag */}
              {flagRow(
                "is_team_leader",
                "Team Leader",
                "Team leaders are excluded from the leaderboard ranking but can still work on tickets.",
                isTeamLeader,
                setIsTeamLeader,
              )}

              {/* Head technician flag — what it unlocks is set in Pengaturan Akses */}
              {flagRow(
                "is_head_technician",
                "Head Teknisi",
                "Bersama koordinator toko, bisa melihat harga modal dan margin sesuai Pengaturan Akses.",
                isHeadTechnician,
                setIsHeadTechnician,
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" disabled={isPending}>
            {isPending && modalStep === "idle" && <Loader2 aria-hidden="true" className="animate-spin" />}
            {isPending && modalStep === "idle" ? "Saving..." : "Save Changes"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="button" onClick={handleDeleteClick} disabled={isPending} className={`sm:ml-auto ${dangerSolid}`}>
            <UserX aria-hidden="true" /> Deactivate User
          </Button>
        </div>
      </form>

      <Dialog open={modalStep !== "idle"} onOpenChange={(open) => { if (!open) closeModal(); }}>
        <DialogContent className="sm:max-w-lg">
          {/* ── Checking ─────────────────────────────────────── */}
          {modalStep === "checking" && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold">Checking Active Tickets…</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4 py-6" role="status">
                <Loader2 aria-hidden="true" className="size-8 animate-spin text-primary" />
                <p className="text-[0.9rem] text-muted-foreground">
                  Checking if {user.name} has any active tickets…
                </p>
              </div>
            </>
          )}

          {/* ── No Active Tickets ─────────────────────────────── */}
          {modalStep === "no_active" && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold">Deactivate User?</DialogTitle>
                <DialogDescription className="flex items-start gap-3 leading-relaxed">
                  <UserX aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
                  <span>
                    Are you sure you want to deactivate <strong className="text-foreground">{user.name}</strong>?
                    Their account will be disabled and they will no longer be able to log in.
                    All historical data (tickets, logs, messages) will be preserved.
                  </span>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={closeModal} disabled={isPending}>Cancel</Button>
                <Button onClick={() => confirmDeactivate()} disabled={isPending} className={dangerSolid}>
                  {isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Trash2 aria-hidden="true" />}
                  Confirm Deactivate
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ── Has Active Tickets — Reassignment Required ────── */}
          {modalStep === "has_active" && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold">Active Tickets Must Be Reassigned</DialogTitle>
              </DialogHeader>

              <Alert variant="warning">
                <AlertTriangle aria-hidden="true" />
                <AlertDescription className="leading-relaxed">
                  <p>
                    <strong>{user.name}</strong> has{" "}
                    <strong>{activeTickets.length} active ticket{activeTickets.length > 1 ? "s" : ""}</strong>{" "}
                    that must be transferred to another technician before this account can be deactivated.
                  </p>
                </AlertDescription>
              </Alert>

              <section className="flex flex-col gap-2">
                <h3 className="text-[0.8125rem] font-semibold tracking-wide text-muted-foreground uppercase">Active Tickets</h3>
                <ul className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
                  {activeTickets.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                      <span className="font-mono font-semibold">#{t.ticket_code}</span>
                      <span className="text-muted-foreground">{typeLabel[t.ticket_type] ?? t.ticket_type}</span>
                      <span className={t.status === "on_progress" ? "text-xs font-semibold text-primary" : "text-xs font-semibold text-muted-foreground"}>
                        {statusLabel[t.status] ?? t.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {technicians.length === 0 ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    <p>⚠️ No other active technicians found. Please create another technician account before deactivating this user.</p>
                  </AlertDescription>
                </Alert>
              ) : (
                <FormField label="Transfer all active tickets to:" htmlFor="eu-reassign">
                  <NativeSelect id="eu-reassign" value={selectedTechId} onChange={(e) => setSelectedTechId(e.target.value)}>
                    <option value="">— Select a technician —</option>
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </NativeSelect>
                </FormField>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={closeModal} disabled={isPending}>Cancel</Button>
                <Button
                  onClick={() => confirmDeactivate(selectedTechId)}
                  disabled={isPending || !selectedTechId || technicians.length === 0}
                  className={dangerSolid}
                >
                  {isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Trash2 aria-hidden="true" />}
                  Reassign &amp; Deactivate
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
