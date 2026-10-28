"use client";

import { useState, useTransition } from "react";
import { createUserAction } from "@/app/actions/admin";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { FormField } from "@/components/app/FormField";
import { PasswordInput } from "@/components/app/PasswordInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CreateUserForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState("Technician");

  const [workDays, setWorkDays] = useState<string[]>([]);

  const toggleDay = (day: string) =>
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );

  const submit = (formData: FormData) => {
    formData.append("work_days", JSON.stringify(workDays));
    startTransition(async () => {
      const result = await createUserAction(formData);
      if (result?.error) toast.error(result.error);
      else {
        toast.success("User created!");
        router.push("/admin/users");
      }
    });
  };

  return (
    <form action={submit} data-slot="create-user-form" className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Full Name" htmlFor="cu-name" required>
              <Input id="cu-name" name="name" required placeholder="John Doe" />
            </FormField>
            <FormField label="Email" htmlFor="cu-email" required>
              <Input id="cu-email" name="email" type="email" required placeholder="user@example.com" />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Phone" htmlFor="cu-phone">
              <Input id="cu-phone" name="phone_number" inputMode="tel" placeholder="+6281234567890" />
            </FormField>
            <FormField label="Role" htmlFor="cu-role">
              <NativeSelect id="cu-role" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
                {["Administrator", "Technician", "Sales", "RMA", "Customer"].map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </NativeSelect>
            </FormField>
          </div>

          <FormField label="Address" htmlFor="cu-address">
            <Textarea id="cu-address" name="address" rows={2} placeholder="Full address" />
          </FormField>

          <FormField
            label="Password"
            htmlFor="cu-password"
            hint=" (opsional)"
            help="Kosongkan untuk staf yang masuk lewat SSO HNS: akun ini tertaut otomatis berdasarkan email saat ia login pertama kali, dengan role yang dipilih di atas."
          >
            <PasswordInput id="cu-password" name="password" minLength={8} placeholder="Min 8 characters" />
          </FormField>
        </CardContent>
      </Card>

      {/* Technician-specific */}
      {role === "Technician" && (
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="font-semibold">Technician Configuration</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Shift" htmlFor="cu-shift">
                <NativeSelect id="cu-shift" name="shift">
                  <option value="">No shift</option>
                  <option value="morning">Morning (09:00–18:00)</option>
                  <option value="noon">Noon (12:00–22:00)</option>
                </NativeSelect>
              </FormField>
              <FormField label="Max Points" htmlFor="cu-max-points">
                <Input id="cu-max-points" name="max_points" type="number" defaultValue={7} min={1} max={20} />
              </FormField>
            </div>
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
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
          {isPending ? "Creating..." : "Create User"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
