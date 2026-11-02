"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { Eye, ExternalLink, Download, FileText } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Opens an attachment in a modal instead of a new tab.
 *
 * Follows the viewer already used in PcBuildHandover: an iframe for PDFs, an
 * img for images. Anything it cannot render inline falls back to a link, so an
 * unknown file type is still reachable rather than a dead button.
 */

type Kind = "image" | "pdf" | "video" | "other";

const EXT: Record<string, Kind> = {
  jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image", avif: "image", svg: "image",
  pdf: "pdf",
  mp4: "video", webm: "video", mov: "video",
};

function kindOf(url: string, hint?: string): Kind {
  if (hint === "image" || hint === "pdf" || hint === "video") return hint;
  // strip query/hash before reading the extension
  const clean = url.split(/[?#]/)[0];
  const ext = clean.split(".").pop()?.toLowerCase() ?? "";
  return EXT[ext] ?? "other";
}

export default function FilePreview({
  url,
  label = "Lihat Lampiran",
  title,
  fileType,
  className,
}: {
  url: string;
  label?: string;
  /** Modal heading; defaults to the button label. */
  title?: string;
  /** Optional hint from the DB, so a URL without an extension still renders. */
  fileType?: string;
  /** Overrides the trigger's classes; left out, it is an outline button. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const kind = kindOf(url, fileType);
  const heading = title ?? label;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? buttonVariants({ variant: "outline", className: "bg-card" })}
      >
        <Eye aria-hidden="true" className="size-[15px]" />
        {label}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={heading} maxWidth="900px">
        <div className="flex flex-col gap-4">
          <div className="flex min-h-80 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
            {kind === "pdf" && (
              <iframe src={url} title={heading} className="h-[70vh] w-full border-0 bg-white" />
            )}

            {kind === "image" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={heading} className="block max-h-[70vh] w-full object-contain" />
            )}

            {kind === "video" && (
              <video src={url} controls className="max-h-[70vh] w-full bg-black" />
            )}

            {kind === "other" && (
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center text-muted-foreground">
                <FileText aria-hidden="true" className="size-10 opacity-60" />
                <p className="text-sm">Tipe berkas ini tidak dapat ditampilkan di sini.</p>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <a href={url} download className={buttonVariants({ variant: "ghost" })}>
              <Download aria-hidden="true" /> Unduh
            </a>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", className: "bg-card" })}
            >
              <ExternalLink aria-hidden="true" /> Buka di Tab Baru
            </a>
            <Button type="button" onClick={() => setOpen(false)}>
              Tutup
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
