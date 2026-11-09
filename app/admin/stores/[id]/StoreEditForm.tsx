"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Trash2, UserPlus, X, Users, Clock, Crown } from "lucide-react";
import {
  updateStoreAction,
  deleteStoreAction,
  assignTechnicianToStoreAction,
  removeTechnicianFromStoreAction,
} from "@/app/actions/stores";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { EmptyState } from "@/components/app/EmptyState";
import { FormField } from "@/components/app/FormField";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { errorOf } from "@/lib/action-result";
import { cn } from "@/lib/utils";

interface Technician { id: string; name: string; }
interface Assignment { technician_id: string; technician: { id: string; name: string; shift: string | null; is_team_leader?: boolean }; }

interface Store {
  id: string; name: string; code: string; address: string | null;
  is_active: boolean; _count: { tickets: number };
  technician_stores: Assignment[];
}

export default function StoreEditForm({
  store,
  allTechnicians,
  children,
}: {
  store: Store;
  allTechnicians: Technician[];
  /** Further cards, shown after the technicians (the kepala toko). */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isActive, setIsActive] = useState(store.is_active);
  const [selectedTech, setSelectedTech] = useState("");

  const assignedIds = store.technician_stores.map((a) => a.technician_id);
  const unassignedTechs = allTechnicians.filter((t) => !assignedIds.includes(t.id));

  const save = (formData: FormData) => {
    formData.set("is_active", isActive ? "1" : "0");
    startTransition(async () => {
      const result = await updateStoreAction(store.id, formData);
      const error = errorOf(result);
      if (error) toast.error(error);
      else { toast.success("Store updated!"); router.refresh(); }
    });
  };

  // An error is toasted and the dialog closes, as it always did.
  const handleDelete = async () => {
    const result = await deleteStoreAction(store.id);
    const error = errorOf(result);
    if (error) { toast.error(error); }
    else { toast.success("Store deleted"); router.push("/admin/stores"); }
  };

  const assignTech = () => {
    if (!selectedTech) return;
    startTransition(async () => {
      await assignTechnicianToStoreAction(selectedTech, store.id);
      toast.success("Technician assigned");
      setSelectedTech("");
      router.refresh();
    });
  };

  const removeTech = (techId: string, techName: string) => {
    startTransition(async () => {
      await removeTechnicianFromStoreAction(techId, store.id);
      toast.success(`${techName} removed from store`);
      router.refresh();
    });
  };

  return (
    <div data-slot="store-edit" className="flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Store Locations", href: "/admin/stores" }, { label: store.name }]}
        title={store.name}
        description={
          <span className="flex items-center gap-2">
            <span className="rounded-full border border-tone-green-border bg-tone-green-bg px-2 py-0.5 font-mono text-xs font-semibold text-tone-green-fg">
              {store.code}
            </span>
            · {store._count.tickets} tickets
          </span>
        }
      />

      {/* Store Details */}
      <Card>
        <CardHeader>
          <CardTitle className="font-semibold">Store Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={save} className="flex flex-col gap-4">
            <FormField label="Store Name" htmlFor="se-name" required>
              <Input id="se-name" name="name" defaultValue={store.name} required />
            </FormField>
            <FormField label="Address" htmlFor="se-address">
              <Textarea id="se-address" name="address" rows={2} defaultValue={store.address ?? ""} />
            </FormField>
            <div className="flex items-center gap-3">
              <Label htmlFor="se-status" className="text-sm font-medium">Status</Label>
              <button
                id="se-status"
                type="button"
                aria-pressed={isActive}
                onClick={() => setIsActive((p) => !p)}
                className={cn(
                  "inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold outline-none transition-opacity hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8",
                  isActive
                    ? "border-tone-green-border bg-tone-green-bg text-tone-green-fg"
                    : "border-tone-red-border bg-tone-red-bg text-tone-red-fg",
                )}
              >
                {isActive ? "Active" : "Inactive"}
              </button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
              <div className="sm:ml-auto">
                <ConfirmDialog
                  trigger={<Button type="button" className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:w-auto" />}
                  triggerLabel={<><Trash2 aria-hidden="true" /> Delete Store</>}
                  title="Delete Store?"
                  description={
                    <>
                      Are you sure you want to delete <strong>{store.name}</strong>?
                      This cannot be undone. Stores with tickets cannot be deleted — deactivate them instead.
                    </>
                  }
                  cancelLabel="Cancel"
                  confirmLabel="Delete"
                  variant="destructive"
                  onConfirm={handleDelete}
                />
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Technician Assignments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-semibold">
            <Users aria-hidden="true" className="size-[18px] text-primary" />
            Assigned Technicians ({store.technician_stores.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {/* Assign new technician */}
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/50 p-4 sm:flex-row sm:items-center">
            <label htmlFor="se-assign" className="sr-only">Technician to assign</label>
            <NativeSelect
              id="se-assign"
              value={selectedTech}
              onChange={(e) => setSelectedTech(e.target.value)}
              className="sm:flex-1"
              disabled={unassignedTechs.length === 0 || isPending}
            >
              {unassignedTechs.length === 0 ? (
                <option value="">All technicians are assigned to this store</option>
              ) : (
                <>
                  <option value="">Select technician to assign...</option>
                  {unassignedTechs.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </>
              )}
            </NativeSelect>
            <Button type="button" onClick={assignTech} disabled={!selectedTech || isPending || unassignedTechs.length === 0}>
              <UserPlus aria-hidden="true" /> Assign
            </Button>
          </div>

          {store.technician_stores.length === 0 ? (
            <EmptyState icon={Users} title="No technicians assigned yet" className="py-6" />
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {store.technician_stores.map((a) => (
                <li
                  key={a.technician_id}
                  className="relative flex items-start justify-between gap-3 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-xs"
                >
                  <span aria-hidden="true" className="absolute top-0 left-0 h-full w-1 bg-primary" />
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative shrink-0">
                      <div className="flex size-10 items-center justify-center rounded-full bg-secondary text-sm font-bold text-primary">
                        {a.technician.name.substring(0, 2).toUpperCase()}
                      </div>
                      {a.technician.is_team_leader && (
                        <span className="absolute -top-2 -right-2 rounded-full border-2 border-card bg-amber-500 p-0.5 text-white" title="Coordinator">
                          <Crown aria-label="Coordinator" className="size-3" strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{a.technician.name}</div>
                      {a.technician.shift && (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock aria-hidden="true" className="size-3" /> <span className="capitalize">{a.technician.shift}</span> shift
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeTech(a.technician_id, a.technician.name)}
                    disabled={isPending}
                    title="Remove from store"
                    aria-label={`Remove ${a.technician.name} from store`}
                    className="text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <X aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {children}
    </div>
  );
}
