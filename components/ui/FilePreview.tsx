"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { Eye, ExternalLink, Download, FileText } from "lucide-react";

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
  className = "btn btn-secondary",
}: {
  url: string;
  label?: string;
  /** Modal heading; defaults to the button label. */
  title?: string;
  /** Optional hint from the DB, so a URL without an extension still renders. */
  fileType?: string;
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
        className={className}
        style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
      >
        <Eye size={15} />
        {label}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={heading} maxWidth="900px">
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
              background: "var(--cream)",
              minHeight: "320px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {kind === "pdf" && (
              <iframe
                src={url}
                title={heading}
                style={{ width: "100%", height: "70vh", border: "none", background: "#fff" }}
              />
            )}

            {kind === "image" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={heading}
                style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", display: "block" }}
              />
            )}

            {kind === "video" && (
              <video src={url} controls style={{ width: "100%", maxHeight: "70vh", background: "#000" }} />
            )}

            {kind === "other" && (
              <div style={{ textAlign: "center", padding: "3rem 1.5rem", color: "var(--text-muted)" }}>
                <FileText size={40} style={{ margin: "0 auto 0.75rem", opacity: 0.6 }} />
                <p style={{ margin: 0, fontSize: "0.875rem" }}>
                  Tipe berkas ini tidak dapat ditampilkan di sini.
                </p>
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", flexWrap: "wrap" }}>
            <a
              href={url}
              download
              className="btn btn-ghost"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <Download size={15} /> Unduh
            </a>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <ExternalLink size={15} /> Buka di Tab Baru
            </a>
            <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
              Tutup
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
