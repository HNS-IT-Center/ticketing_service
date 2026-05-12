"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStoreAction } from "@/app/actions/stores";
import toast from "react-hot-toast";
import { Store, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function CreateStorePage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await createStoreAction(formData);
      if ((result as any)?.error) {
        toast.error((result as any).error);
      } else {
        toast.success("Store created successfully!");
        router.push("/admin/stores");
      }
    });
  };

  return (
    <div className="max-w-lg mx-auto flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/stores" className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add Store Location</h1>
          <p className="text-gray-500 text-sm">Create a new operational store</p>
        </div>
      </div>

      <div className="card">
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="form-group">
            <label className="form-label">Store Name *</label>
            <input
              name="name"
              className="form-input"
              placeholder="e.g. Nagoya Gateway"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Store Code * <span className="text-gray-400 font-normal text-xs">(2–6 uppercase letters, used in ticket numbers)</span></label>
            <input
              name="code"
              className="form-input font-mono uppercase"
              placeholder="e.g. NGW"
              maxLength={6}
              required
              style={{ textTransform: "uppercase" }}
            />
            <p className="text-xs text-gray-400 mt-1">
              Tickets from this store will be numbered: <strong className="font-mono">NGW-000001</strong>
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">Address <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              name="address"
              className="form-input"
              rows={2}
              placeholder="Store address..."
            />
          </div>

          <div className="flex gap-3 mt-2">
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? <><span className="spinner spinner-sm" />Creating...</> : "Create Store"}
            </button>
            <Link href="/admin/stores" className="btn btn-ghost">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
