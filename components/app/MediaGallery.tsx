"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";
import { PdfViewer } from "@/components/app/PdfViewer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { downloadHref } from "@/lib/download-name";
import { cn } from "@/lib/utils";

/**
 * Photos, videos and PDFs of one ticket, opened in a pop-up with previous /
 * next and a real download.
 *
 * `MediaGallery` holds the list and the viewer; anything inside it can open
 * the viewer at an index through `GalleryTrigger`, so a server component keeps
 * rendering its own thumbnails and only the click is client-side.
 */

export type MediaItem = {
  url: string;
  /** "image" | "video" | "pdf" — the stored FileType; anything else is "other". */
  fileType: string;
  title: string;
  /** A line under the title, e.g. when it was uploaded. */
  meta?: string;
  /** The name the file is saved under; defaults to the title. */
  downloadName?: string;
};

const GalleryContext = createContext<((index: number) => void) | null>(null);

const KIND_LABEL: Record<string, string> = { image: "Foto", video: "Video", pdf: "PDF" };

export function MediaGallery({ items, children }: { items: MediaItem[]; children: React.ReactNode }) {
  const [index, setIndex] = useState<number | null>(null);
  const open = useCallback((i: number) => setIndex(i), []);
  return (
    <GalleryContext.Provider value={open}>
      {children}
      <MediaViewer items={items} index={index} onIndex={setIndex} />
    </GalleryContext.Provider>
  );
}

/** A thumbnail or button that opens the gallery at `index`. */
export function GalleryTrigger({
  index,
  children,
  className,
  title,
}: {
  index: number;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const open = useContext(GalleryContext);
  return (
    <button type="button" title={title} onClick={() => open?.(index)} className={cn("cursor-zoom-in text-left", className)}>
      {children}
    </button>
  );
}

function MediaViewer({
  items,
  index,
  onIndex,
}: {
  items: MediaItem[];
  index: number | null;
  onIndex: (i: number | null) => void;
}) {
  const count = items.length;
  const item = index === null ? null : items[index];
  const touchX = useRef<number | null>(null);

  const go = useCallback(
    (step: number) => {
      if (index === null || count < 2) return;
      onIndex((index + step + count) % count);
    },
    [index, count, onIndex],
  );

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go]);

  const kind = item ? (KIND_LABEL[item.fileType] ? item.fileType : "other") : "other";

  return (
    <Dialog open={item !== null} onOpenChange={(next) => !next && onIndex(null)}>
      <DialogContent className="max-h-[calc(100svh-1rem)] gap-3 overflow-y-auto p-4 sm:max-w-none" style={{ maxWidth: "min(900px, calc(100% - 1rem))" }}>
        {item && (
          <>
            <DialogHeader className="gap-1 pr-10">
              <DialogTitle className="text-base font-semibold [overflow-wrap:anywhere]">{item.title}</DialogTitle>
              <DialogDescription className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                {item.meta && <span>{item.meta}</span>}
                <span>{KIND_LABEL[item.fileType] ?? "Berkas"}</span>
                {count > 1 && <span>{(index ?? 0) + 1} dari {count}</span>}
              </DialogDescription>
            </DialogHeader>

            <div
              className={cn(
                "relative flex min-h-64 items-center justify-center overflow-hidden rounded-lg",
                kind === "pdf" ? "bg-muted p-2" : "bg-black",
              )}
              onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
              onTouchEnd={(e) => {
                const start = touchX.current;
                touchX.current = null;
                const end = e.changedTouches[0]?.clientX;
                if (start === null || end === undefined || Math.abs(end - start) < 50) return;
                go(end < start ? 1 : -1);
              }}
            >
              {kind === "image" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={item.url} src={item.url} alt={item.title} className="block max-h-[70svh] w-full object-contain" />
              )}
              {kind === "video" && (
                <video key={item.url} src={item.url} controls playsInline preload="metadata" className="max-h-[70svh] w-full" />
              )}
              {kind === "pdf" && <PdfViewer key={item.url} url={item.url} title={item.title} />}
              {kind === "other" && (
                <div className="flex flex-col items-center gap-3 px-6 py-12 text-center text-white/70">
                  <FileText aria-hidden="true" className="size-10" />
                  <p className="text-sm">Berkas ini tidak bisa ditampilkan di sini. Unduh untuk membukanya.</p>
                </div>
              )}

              {count > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => go(-1)}
                    aria-label="Sebelumnya"
                    className="absolute top-1/2 left-2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white outline-none hover:bg-black/80 focus-visible:ring-3 focus-visible:ring-white/60"
                  >
                    <ChevronLeft aria-hidden="true" className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => go(1)}
                    aria-label="Berikutnya"
                    className="absolute top-1/2 right-2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white outline-none hover:bg-black/80 focus-visible:ring-3 focus-visible:ring-white/60"
                  >
                    <ChevronRight aria-hidden="true" className="size-5" />
                  </button>
                </>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {/* Through this app's own origin: `download` is ignored for the R2 domain. */}
              <a href={downloadHref(item.url, item.downloadName ?? item.title)} download className={buttonVariants({ variant: "outline", size: "sm", className: "bg-card" })}>
                <Download aria-hidden="true" /> Unduh
              </a>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
