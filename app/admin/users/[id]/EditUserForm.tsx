"use client";

import { useState, useTransition } from "react";
import { updateUserAction } from "@/app/actions/admin";
import { DeactivateUserButton } from "@/components/users/DeactivateUserButton";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { FormField } from "@/components/app/FormField";
import { errorOf } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function EditUserForm({ user }: { user: User }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
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
            {isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <DeactivateUserButton user={user} afterDone="list" className="sm:ml-auto" />
        </div>
      </form>

    </>
  );
}
