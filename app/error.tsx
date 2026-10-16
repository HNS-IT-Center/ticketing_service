"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

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

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <div className="card flex w-full max-w-md flex-col items-center gap-4 p-6 text-center">
        <AlertTriangle size={36} style={{ color: "var(--accent-brand, #b45309)" }} />
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Terjadi kesalahan</h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Halaman ini gagal dimuat. Coba lagi; bila tetap gagal, hubungi administrator
            {error.digest ? ` dengan kode ${error.digest}` : ""}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="btn btn-primary flex items-center gap-2"
        >
          <RotateCw size={16} /> Coba lagi
        </button>
      </div>
    </div>
  );
}
