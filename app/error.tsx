"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isStaleDeployError } from "@/lib/stale-deploy";

/**
 * The app's own error boundary.
 *
 * There was none, so any uncaught error — a failed upload being the usual one —
 * fell through to Next's bare "Application error" screen with no way back but
 * a full reload. Retrying here re-renders the segment in place instead.
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  // A page older than the server: say so, and reload rather than retry —
  // retrying re-sends the same unknown action id (lib/stale-deploy.ts).
  if (isStaleDeployError(error)) {
    return (
      <div data-slot="app-error" className="flex min-h-[50vh] items-center justify-center p-4">
        <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <RotateCw aria-hidden="true" className="size-9 text-primary" />
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-foreground">Aplikasi baru saja diperbarui</h2>
            <p className="text-sm text-muted-foreground">
              Halaman ini dibuka sebelum pembaruan, jadi permintaan tadi ditolak server dan belum tersimpan. Muat ulang halaman, lalu ulangi.
            </p>
          </div>
          <Button type="button" onClick={() => window.location.reload()} className="w-full sm:w-auto">
            <RotateCw aria-hidden="true" /> Muat ulang
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div data-slot="app-error" className="flex min-h-[50vh] items-center justify-center p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-card p-6 text-center shadow-sm">
        <AlertTriangle aria-hidden="true" className="size-9 text-destructive" />
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-foreground">Terjadi kesalahan</h2>
          <p className="text-sm text-muted-foreground">
            Halaman ini gagal dimuat. Coba lagi; bila tetap gagal, hubungi administrator
            {error.digest ? ` dengan kode ${error.digest}` : ""}.
          </p>
        </div>
        <Button type="button" onClick={() => unstable_retry()} className="w-full sm:w-auto">
          <RotateCw aria-hidden="true" /> Coba lagi
        </Button>
      </div>
    </div>
  );
}
