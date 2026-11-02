"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStoreAction } from "@/app/actions/stores";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { FormField } from "@/components/app/FormField";
import { PageHeader } from "@/components/app/PageHeader";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errorOf } from "@/lib/action-result";

export default function CreateStorePage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await createStoreAction(formData);
      const error = errorOf(result);
      if (error) {
        toast.error(error);
      } else {
        toast.success("Store created successfully!");
        router.push("/admin/stores");
      }
    });
  };

  return (
    <div data-slot="create-store-page" className="flex w-full max-w-lg flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Store Locations", href: "/admin/stores" }, { label: "Add Store Location" }]}
        title="Add Store Location"
        description="Create a new operational store"
      />

      <Card>
        <CardContent>
          <form action={handleSubmit} className="flex flex-col gap-4">
            <FormField label="Store Name" htmlFor="cs-name" required>
              <Input id="cs-name" name="name" placeholder="e.g. Nagoya Gateway" required />
            </FormField>

            <FormField
              label="Store Code"
              htmlFor="cs-code"
              required
              hint=" (2–6 uppercase letters, used in ticket numbers)"
            >
              <Input id="cs-code" name="code" className="font-mono uppercase" placeholder="e.g. NGW" maxLength={6} required />
              <p className="text-xs text-muted-foreground">
                Tickets from this store will be numbered: <strong className="font-mono">NGW-000001</strong>
              </p>
            </FormField>

            <FormField label="Address" htmlFor="cs-address" hint=" (optional)">
              <Textarea id="cs-address" name="address" rows={2} placeholder="Store address..." />
            </FormField>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
                {isPending ? "Creating..." : "Create Store"}
              </Button>
              <Link href="/admin/stores" className={buttonVariants({ variant: "ghost" })}>Cancel</Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
