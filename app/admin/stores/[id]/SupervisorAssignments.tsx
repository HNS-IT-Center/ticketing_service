"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Gauge, UserPlus, X } from "lucide-react";
import { assignSupervisorToStoreAction, removeSupervisorFromStoreAction } from "@/app/actions/stores";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { errorOf } from "@/lib/action-result";
import { isNavigationSignal } from "@/lib/navigation-signal";

type Person = { id: string; name: string; email?: string };

/**
 * Who heads this store: accounts with the Kepala Toko role, who then see this
 * store's dashboard (read only). Several may share one store, and one may hold
 * several stores.
 */
export default function SupervisorAssignments({
  storeId,
  assigned,
  candidates,
}: {
  storeId: string;
  assigned: Person[];
  candidates: Person[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState("");
  const free = candidates.filter((c) => !assigned.some((a) => a.id === c.id));

  const run = (fn: () => Promise<unknown>, ok: string) =>
    startTransition(async () => {
      try {
        const error = errorOf(await fn());
        if (error) {
          toast.error(error);
          return;
        }
        toast.success(ok);
        setSelected("");
        router.refresh();
      } catch (err) {
        if (isNavigationSignal(err)) return;
        toast.error("Gagal menyimpan. Periksa koneksi lalu coba lagi.");
      }
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-semibold">
          <Gauge aria-hidden="true" className="size-[18px] text-primary" />
          Kepala Toko ({assigned.length})
        </CardTitle>
        <CardDescription>
          Melihat Dashboard Toko untuk toko ini saja, tanpa bisa mengubah apa pun. Akunnya harus ber-role Kepala Toko (atur di
          Users).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/50 p-4 sm:flex-row sm:items-center">
          <label htmlFor="se-supervisor" className="sr-only">
            Kepala toko yang ditugaskan
          </label>
          <NativeSelect
            id="se-supervisor"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="sm:flex-1"
            disabled={free.length === 0 || isPending}
          >
            {free.length === 0 ? (
              <option value="">
                {candidates.length === 0 ? "Belum ada akun ber-role Kepala Toko" : "Semua kepala toko sudah ditugaskan di sini"}
              </option>
            ) : (
              <>
                <option value="">Pilih kepala toko…</option>
                {free.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </>
            )}
          </NativeSelect>
          <Button
            type="button"
            disabled={!selected || isPending}
            onClick={() => run(() => assignSupervisorToStoreAction(selected, storeId), "Kepala toko ditugaskan.")}
          >
            <UserPlus aria-hidden="true" /> Tugaskan
          </Button>
        </div>

        {assigned.length === 0 ? (
          <EmptyState icon={Gauge} title="Belum ada kepala toko" className="py-6" />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {assigned.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{a.name}</div>
                  {a.email && <div className="truncate text-xs text-muted-foreground">{a.email}</div>}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={isPending}
                  aria-label={`Lepas ${a.name} dari toko ini`}
                  title="Lepas dari toko"
                  onClick={() => run(() => removeSupervisorFromStoreAction(a.id, storeId), `${a.name} dilepas.`)}
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
  );
}
