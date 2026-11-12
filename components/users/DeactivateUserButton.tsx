"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AlertTriangle, Loader2, Trash2, UserX } from "lucide-react";
import { checkUserDeletionAction, deactivateUserAction } from "@/app/actions/admin";
import { FormField } from "@/components/app/FormField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { errorOf } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { isHandledActionError } from "@/lib/navigation-signal";

type ActiveTicket = { id: string; ticket_code: string; ticket_type: string; status: string };
type Technician = { id: string; name: string };
type Step = "idle" | "checking" | "no_active" | "has_active";

const STATUS_LABEL: Record<string, string> = { waiting: "Waiting", on_progress: "In Progress" };
const TYPE_LABEL: Record<string, string> = {
  service: "Service",
  warranty_claim: "Warranty",
  pc_build: "PC Build",
  cleaning: "Cleaning",
  upgrade: "Upgrade",
};

// A solid red for the irreversible step, as the legacy btn-danger was.
const DANGER_SOLID = "bg-destructive text-destructive-foreground hover:bg-destructive/90";

/**
 * "Delete" for a user: the account is deactivated, never removed, because its
 * tickets, logs and messages must keep saying who did the work. Active
 * tickets are handed to another technician first.
 *
 * Used on the user list (a compact button per row) and on the edit page.
 */
export function DeactivateUserButton({
  user,
  compact = false,
  afterDone = "refresh",
  className,
}: {
  user: { id: string; name: string };
  /** An icon-sized button for a table row. */
  compact?: boolean;
  /** Stay on the page and re-read it, or go back to the user list. */
  afterDone?: "refresh" | "list";
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("idle");
  const [activeTickets, setActiveTickets] = useState<ActiveTicket[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTechId, setSelectedTechId] = useState("");

  const start = () => {
    setStep("checking");
    startTransition(async () => {
      try {
        const { activeTickets: tickets } = await checkUserDeletionAction(user.id);
        if (tickets.length === 0) {
          setActiveTickets([]);
          setStep("no_active");
          return;
        }
        setActiveTickets(tickets);
        const res = await fetch(`/api/technicians?exclude=${user.id}`);
        const data = await res.json();
        setTechnicians(data.technicians ?? []);
        setSelectedTechId("");
        setStep("has_active");
      } catch (err) {
        // Next moving the page (e.g. the login ran out) is not a failure.
        if (isHandledActionError(err)) return;
        toast.error("Gagal memeriksa tiket aktif. Coba lagi.");
        setStep("idle");
      }
    });
  };

  const close = () => {
    setStep("idle");
    setActiveTickets([]);
    setTechnicians([]);
    setSelectedTechId("");
  };

  const confirm = (reassignTo?: string) => {
    startTransition(async () => {
      const result = await deactivateUserAction(user.id, reassignTo || null);
      const error = errorOf(result);
      if (error) {
        toast.error(error);
        close();
        return;
      }
      toast.success(`${user.name} has been deactivated.`);
      close();
      if (afterDone === "list") router.push("/admin/users");
      else router.refresh();
    });
  };

  return (
    <>
      {compact ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={start}
          disabled={isPending}
          aria-label={`Nonaktifkan ${user.name}`}
          title="Nonaktifkan pengguna"
          className={cn("bg-card text-destructive hover:bg-tone-red-bg hover:text-destructive", className)}
        >
          <UserX aria-hidden="true" />
          <span className="md:sr-only">Nonaktifkan</span>
        </Button>
      ) : (
        <Button type="button" onClick={start} disabled={isPending} className={cn(DANGER_SOLID, className)}>
          <UserX aria-hidden="true" /> Deactivate User
        </Button>
      )}

      <Dialog open={step !== "idle"} onOpenChange={(open) => { if (!open && !isPending) close(); }}>
        <DialogContent className="sm:max-w-lg">
          {step === "checking" && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold">Checking Active Tickets…</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4 py-6" role="status">
                <Loader2 aria-hidden="true" className="size-8 animate-spin text-primary" />
                <p className="text-[0.9rem] text-muted-foreground">Checking if {user.name} has any active tickets…</p>
              </div>
            </>
          )}

          {step === "no_active" && (
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
                <Button variant="outline" onClick={close} disabled={isPending}>Cancel</Button>
                <Button onClick={() => confirm()} disabled={isPending} className={DANGER_SOLID}>
                  {isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Trash2 aria-hidden="true" />}
                  Confirm Deactivate
                </Button>
              </DialogFooter>
            </>
          )}

          {step === "has_active" && (
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
                      <span className="text-muted-foreground">{TYPE_LABEL[t.ticket_type] ?? t.ticket_type}</span>
                      <span className={t.status === "on_progress" ? "text-xs font-semibold text-primary" : "text-xs font-semibold text-muted-foreground"}>
                        {STATUS_LABEL[t.status] ?? t.status}
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
                <FormField label="Transfer all active tickets to:" htmlFor={`reassign-${user.id}`}>
                  <NativeSelect id={`reassign-${user.id}`} value={selectedTechId} onChange={(e) => setSelectedTechId(e.target.value)}>
                    <option value="">— Select a technician —</option>
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </NativeSelect>
                </FormField>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={close} disabled={isPending}>Cancel</Button>
                <Button
                  onClick={() => confirm(selectedTechId)}
                  disabled={isPending || !selectedTechId || technicians.length === 0}
                  className={DANGER_SOLID}
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
