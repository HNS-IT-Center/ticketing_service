"use client";

import { useState, useTransition } from "react";
import { adminAssignTicketAction } from "@/app/actions/admin";
import toast from "react-hot-toast";
import { Loader2, Lock } from "lucide-react";
import { FormField } from "@/components/app/FormField";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { errorOf } from "@/lib/action-result";

interface Props {
  ticketId: string;
  currentTechnicianId: string | null;
  currentSalesId: string | null;
  technicians: { id: string; name: string }[];
  salesUsers: { id: string; name: string }[];
  assignmentRequests?: { id: string; technician_id: string; technician: { name: string }; status: string }[];
  ticketStatus?: string;
}

export default function AdminAssignPanel({
  ticketId,
  currentTechnicianId,
  currentSalesId,
  technicians,
  salesUsers,
  assignmentRequests = [],
  ticketStatus = "waiting",
}: Props) {
  const [techId, setTechId] = useState(currentTechnicianId || "");
  const [saleId, setSaleId] = useState(currentSalesId || "");
  const [isPending, startTransition] = useTransition();

  const isTechLocked = ticketStatus !== "waiting";

  const save = () => {
    startTransition(async () => {
      const result = await adminAssignTicketAction(
        ticketId,
        techId || null,
        saleId || null
      );
      const error = errorOf(result);
      if (error) toast.error(error);
      else toast.success("Assignment updated!");
    });
  };

  const pendingRequests = assignmentRequests.filter(r => r.status === "pending" && r.technician_id !== currentTechnicianId);

  const assignedTech = technicians.find(t => t.id === currentTechnicianId);

  return (
    <Card className="w-full self-start">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Assignment</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {pendingRequests.length > 0 && (
          <Alert variant="info">
            <AlertTitle>Technician Requests:</AlertTitle>
            <AlertDescription>
              <ul className="flex w-full flex-col gap-2">
                {pendingRequests.map(req => (
                  <li key={req.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0">{req.technician.name} requested to be assigned.</span>
                    <Button type="button" size="sm" variant="outline" className="shrink-0 bg-card" onClick={() => setTechId(req.technician_id)}>
                      Select
                    </Button>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {isTechLocked ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Technician</span>
              <span className="flex items-center gap-1 text-[0.7rem] font-semibold text-tone-amber-fg">
                <Lock aria-hidden="true" className="size-3" /> Locked
              </span>
            </div>
            <div className="rounded-lg border border-border bg-muted px-3 py-2 font-semibold">
              {assignedTech?.name ?? <span className="font-normal text-muted-foreground italic">Unassigned</span>}
            </div>
          </div>
        ) : (
          <FormField label="Technician" htmlFor="assign-technician">
            <NativeSelect id="assign-technician" value={techId} onChange={(e) => setTechId(e.target.value)}>
              <option value="">— Unassigned —</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </NativeSelect>
          </FormField>
        )}

        <FormField label="Sales" htmlFor="assign-sales">
          <NativeSelect id="assign-sales" value={saleId} onChange={(e) => setSaleId(e.target.value)}>
            <option value="">— Unassigned —</option>
            {salesUsers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </NativeSelect>
        </FormField>

        <Button onClick={save} disabled={isPending} className="w-full sm:w-auto sm:self-start">
          {isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
          {isPending ? "Saving..." : "Save Assignment"}
        </Button>
      </CardContent>
    </Card>
  );
}
