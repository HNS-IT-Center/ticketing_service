"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { STALE_DEPLOY_EVENT, announceStaleDeploy, isStaleDeployError } from "@/lib/stale-deploy";

/** How often a page that comes back into view asks which build is serving. */
const CHECK_EVERY_MS = 60_000;

type Reason = "rejected" | "new_version";

const COPY: Record<Reason, { title: string; body: string }> = {
  rejected: {
    title: "Aplikasi baru saja diperbarui",
    body: "Halaman ini dibuka sebelum pembaruan, jadi tombol yang Anda tekan memakai versi lama dan ditolak server. Data belum tersimpan. Muat ulang halaman, periksa isiannya, lalu kirim lagi. Form buat tiket, serah terima RMA, dan rincian biaya menyimpan isiannya otomatis.",
  },
  new_version: {
    title: "Ada versi baru aplikasi",
    body: "Aplikasi diperbarui sejak halaman ini dibuka. Muat ulang sebelum menyimpan apa pun, supaya tidak ditolak server. Form buat tiket, serah terima RMA, dan rincian biaya menyimpan isiannya otomatis.",
  },
};

/**
 * App-wide notice for a page older than the server (lib/stale-deploy.ts).
 * Opens when a server action is refused for that reason, and — before that
 * happens — when a page coming back into view finds a different build serving.
 */
export default function StaleDeployNotice({ build }: { build: string | null }) {
  const [reason, setReason] = useState<Reason | null>(null);
  const lastCheck = useRef(0);
  const dismissed = useRef(false);

  useEffect(() => {
    const onAnnounce = (e: Event) => {
      const r = (e as CustomEvent<Reason>).detail ?? "rejected";
      // A refusal always shows; a mere "new version" only until dismissed once.
      if (r === "new_version" && dismissed.current) return;
      setReason((cur) => (cur === "rejected" ? cur : r));
    };
    // An action error nothing caught still deserves the explanation.
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isStaleDeployError(e.reason)) {
        e.preventDefault();
        announceStaleDeploy("rejected");
      }
    };
    const check = async () => {
      if (!build || document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastCheck.current < CHECK_EVERY_MS) return;
      lastCheck.current = now;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { build: serving } = (await res.json()) as { build: string | null };
        if (serving && serving !== build) announceStaleDeploy("new_version");
      } catch {
        // Offline or the server restarting: nothing to say yet.
      }
    };
    window.addEventListener(STALE_DEPLOY_EVENT, onAnnounce);
    window.addEventListener("unhandledrejection", onRejection);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.removeEventListener(STALE_DEPLOY_EVENT, onAnnounce);
      window.removeEventListener("unhandledrejection", onRejection);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [build]);

  if (!reason) return null;
  const copy = COPY[reason];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          dismissed.current = true;
          setReason(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw aria-hidden="true" className="size-5 text-primary" /> {copy.title}
          </DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" onClick={() => window.location.reload()} className="w-full sm:w-auto">
            <RefreshCw aria-hidden="true" /> Muat ulang sekarang
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
