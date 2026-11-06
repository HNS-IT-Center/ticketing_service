"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { downloadHref } from "@/lib/download-name";

/**
 * A PDF shown inside a pop-up, page by page, instead of a new tab (owner,
 * 2026-11-06: reviewing a PDF must not leave the page).
 *
 * Drawn with pdf.js (through unpdf) rather than an <iframe>: Chrome on
 * Android does not display a PDF in a frame at all — it shows an empty box or
 * starts a download — and that is where most staff review attachments. The
 * bytes come through this app's own `/api/files/download` (staff only), so a
 * file on the storage domain needs no CORS rule.
 */
export function PdfViewer({ url, title }: { url: string; title: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; pages: number }>({ status: "loading", pages: 0 });

  useEffect(() => {
    let cancelled = false;
    const box = holder.current;
    if (!box) return;
    box.replaceChildren();

    (async () => {
      try {
        const res = await fetch(downloadHref(url, title));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = new Uint8Array(await res.arrayBuffer());
        const { getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(data);
        if (cancelled) return;
        setState({ status: "ready", pages: pdf.numPages });

        // Sharp on a phone's dense screen without drawing a huge bitmap.
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        for (let n = 1; n <= pdf.numPages && !cancelled; n++) {
          const page = await pdf.getPage(n);
          const width = box.clientWidth || 600;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.className = "block rounded-md bg-white shadow-sm";
          canvas.setAttribute("aria-label", `${title} — halaman ${n} dari ${pdf.numPages}`);
          canvas.setAttribute("role", "img");
          box.appendChild(canvas);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("canvas unavailable");
          await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise;
        }
      } catch (err) {
        console.error("[PdfViewer]", err);
        if (!cancelled) setState((s) => ({ ...s, status: "error" }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, title]);

  return (
    <div data-slot="pdf-viewer" className="flex w-full flex-col gap-2">
      {state.status === "loading" && (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Membuka PDF…
        </p>
      )}
      {state.status === "error" && (
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center text-sm text-muted-foreground">
          <AlertTriangle aria-hidden="true" className="size-8 opacity-70" />
          <p>PDF ini tidak bisa ditampilkan di sini. Unduh untuk membukanya.</p>
          <a href={downloadHref(url, title)} download className={buttonVariants({ variant: "outline", className: "bg-card" })}>
            <Download aria-hidden="true" /> Unduh PDF
          </a>
        </div>
      )}
      <div
        ref={holder}
        className="flex max-h-[70svh] w-full flex-col gap-3 overflow-y-auto"
        hidden={state.status === "error"}
      />
      {state.status === "ready" && state.pages > 1 && (
        <p className="text-center text-xs text-muted-foreground">{state.pages} halaman — gulir untuk melihat semuanya</p>
      )}
    </div>
  );
}
