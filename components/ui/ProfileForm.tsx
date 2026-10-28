"use client";

import { useState, useTransition } from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { FormField } from "@/components/app/FormField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type UpdateFn = (data: { userId: string; name: string; phone: string; address: string }) => Promise<{ error?: string; success?: boolean }>;

export default function ProfileForm({
  userId,
  initialName,
  initialPhone,
  initialAddress,
  updateAction,
}: {
  userId: string;
  initialName: string;
  initialPhone: string;
  initialAddress: string;
  updateAction: UpdateFn;
}) {
  const stripPrefix = (p: string) => (p.startsWith("+62") ? p.slice(3) : p);

  const [name, setName]       = useState(initialName);
  const [phone, setPhone]     = useState(stripPrefix(initialPhone));
  const [address, setAddress] = useState(initialAddress);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    startTransition(async () => {
      const result = await updateAction({ userId, name, phone: `+62${phone}`, address });
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Profile updated!");
        setSaved(true);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-bold">Edit Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <FormField label="Full Name" htmlFor="pf-name">
            <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" required />
          </FormField>

          <FormField label="Phone Number" htmlFor="pf-phone">
            <div className="flex">
              <span className="flex shrink-0 items-center rounded-l-lg border border-r-0 border-input bg-muted px-3 text-[0.9375rem] font-semibold text-muted-foreground">
                +62
              </span>
              <Input
                id="pf-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                inputMode="numeric"
                placeholder="81234567890"
                className="rounded-l-none"
              />
            </div>
          </FormField>

          <FormField label="Address" htmlFor="pf-address">
            <Textarea id="pf-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Your address" rows={3} />
          </FormField>

          <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
            {saved && (
              <span role="status" className="flex items-center gap-1.5 text-sm text-tone-green-fg">
                <CheckCircle aria-hidden="true" className="size-4" /> Saved!
              </span>
            )}
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
