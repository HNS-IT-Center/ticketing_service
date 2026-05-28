"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { ArrowLeft, Trash2, UserPlus, X, Users } from "lucide-react";
import {
  updateStoreAction,
  deleteStoreAction,
  assignTechnicianToStoreAction,
  removeTechnicianFromStoreAction,
} from "@/app/actions/stores";
import Modal from "@/components/ui/Modal";

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
}: {
  store: Store;
  allTechnicians: Technician[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isActive, setIsActive] = useState(store.is_active);
  const [selectedTech, setSelectedTech] = useState("");

  const assignedIds = store.technician_stores.map((a) => a.technician_id);
  const unassignedTechs = allTechnicians.filter((t) => !assignedIds.includes(t.id));

  const save = (formData: FormData) => {
    formData.set("is_active", isActive ? "1" : "0");
    startTransition(async () => {
      const result = await updateStoreAction(store.id, formData);
      if ((result as any)?.error) toast.error((result as any).error);
      else { toast.success("Store updated!"); router.refresh(); }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteStoreAction(store.id);
      if ((result as any)?.error) { toast.error((result as any).error); setDeleteOpen(false); }
      else { toast.success("Store deleted"); router.push("/admin/stores"); }
    });
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
    <>
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/stores" className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{store.name}</h1>
            <span className="badge badge-sales px-2 py-0.5 mt-0.5">
              {store.code}
            </span>
            <span className="ml-2 text-sm text-gray-500">· {store._count.tickets} tickets</span>
          </div>
        </div>

        {/* Store Details */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">Store Details</h3>
          <form action={save} className="flex flex-col gap-4">
            <div className="form-group">
              <label className="form-label">Store Name *</label>
              <input name="name" className="form-input" defaultValue={store.name} required />
            </div>
            <div className="form-group">
              <label className="form-label">Address</label>
              <textarea name="address" className="form-input" rows={2} defaultValue={store.address ?? ""} />
            </div>
            <div className="flex items-center gap-3">
              <label className="form-label mb-0">Status</label>
              <button
                type="button"
                onClick={() => setIsActive((p) => !p)}
                className={`badge ${isActive ? "badge-done" : "badge-cancelled"} cursor-pointer hover:opacity-80 transition-opacity`}
              >
                {isActive ? "Active" : "Inactive"}
              </button>
            </div>
            <div className="flex gap-3 mt-1">
              <button type="submit" className="btn btn-primary" disabled={isPending}>
                {isPending ? <><span className="spinner spinner-sm" />Saving...</> : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="btn btn-danger"
                style={{ marginLeft: "auto" }}
              >
                <Trash2 size={16} /> Delete Store
              </button>
            </div>
          </form>
        </div>

        {/* Technician Assignments */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Users size={18} className="text-indigo-500" />
              Assigned Technicians ({store.technician_stores.length})
            </h3>
          </div>

          {/* Assign new technician */}
          {unassignedTechs.length > 0 && (
            <div className="flex gap-3 mb-6 items-center bg-gray-50 p-4 rounded-xl border border-gray-100">
              <select
                value={selectedTech}
                onChange={(e) => setSelectedTech(e.target.value)}
                className="form-input flex-1"
              >
                <option value="">Select technician to assign...</option>
                {unassignedTechs.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={assignTech}
                disabled={!selectedTech || isPending}
                className="btn btn-primary flex items-center gap-2 px-6"
              >
                <UserPlus size={16} /> Assign
              </button>
            </div>
          )}

          {store.technician_stores.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">No technicians assigned yet</p>
          ) : (
            <div className="flex flex-col gap-3">
              {store.technician_stores.map((a) => (
                <div
                  key={a.technician_id}
                  className="flex items-center justify-between p-4 bg-white border border-gray-200 shadow-sm rounded-xl hover:border-indigo-300 transition-colors"
                >
                  <div>
                    <div className="font-medium text-gray-800 text-sm flex items-center gap-2">
                      {a.technician.name}
                      {a.technician.is_team_leader && (
                        <span className="badge badge-assigned px-1.5 py-0.5 text-[0.7rem] bg-indigo-50 text-indigo-600 border border-indigo-200">Coordinator</span>
                      )}
                    </div>
                    {a.technician.shift && (
                      <div className="text-xs text-gray-400 capitalize">{a.technician.shift} shift</div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTech(a.technician_id, a.technician.name)}
                    disabled={isPending}
                    className="p-2 text-gray-400 hover:text-white hover:bg-red-500 rounded-lg transition-colors"
                    title="Remove from store"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Store?">
        <p className="text-gray-500 mb-6">
          Are you sure you want to delete <strong>{store.name}</strong>?
          This cannot be undone. Stores with tickets cannot be deleted — deactivate them instead.
        </p>
        <div className="flex gap-3 justify-end">
          <button className="btn btn-ghost" onClick={() => setDeleteOpen(false)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleDelete} disabled={isPending}>
            {isPending ? <span className="spinner spinner-sm" /> : "Delete"}
          </button>
        </div>
      </Modal>
    </>
  );
}
