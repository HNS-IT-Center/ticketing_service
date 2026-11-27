"use client";

import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Crown } from "lucide-react";
import { promoteToOwnerAction } from "@/app/actions/admin";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Button } from "@/components/ui/button";

/**
 * "Jadikan Owner" on an Administrator account (owner, 2026-11-27). The action
 * checks who may: an Administrator or Owner, never on their own account.
 */
export default function PromoteOwnerButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={<Button type="button" variant="outline" className="w-fit" />}
      triggerLabel={
        <>
          <Crown aria-hidden="true" /> Jadikan Owner
        </>
      }
      title={`Jadikan ${name} Owner?`}
      description="Owner bisa membuka semua halaman, mengatur Role & Izin, serta mengubah atau menonaktifkan akun Admin. Setelah itu akun ini hanya bisa diubah oleh Owner. Pemiliknya perlu login ulang."
      confirmLabel="Jadikan Owner"
      onConfirm={async () => {
        const res = await promoteToOwnerAction(userId);
        if ("error" in res && res.error) throw new Error(res.error);
        toast.success(`${name} sekarang Owner.`);
        router.refresh();
      }}
    />
  );
}
