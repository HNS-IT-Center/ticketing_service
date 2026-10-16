"use client";

import { useRef, useState, useEffect, DragEvent, ChangeEvent } from "react";
import { Upload, X, FileText, Image as ImageIcon, Video, Loader2 } from "lucide-react";
import {
  compressFile,
  normalizeFileType,
  resolveMimeType,
  formatBytes,
} from "@/lib/compress";
import { uploadBudgetError, UPLOAD_BUDGET_MB } from "@/lib/upload-limit";

interface FileItem {
  file: File;
  preview?: string;
  originalSize?: number; // size before compression
  compressed?: boolean;  // true if file was actually reduced in size
}

interface FileUploadProps {
  onChange: (files: File[]) => void;
  value?: File[];
  accept?: string;
  maxFiles?: number;
  /** If set, the file input will use this capture mode (e.g. "environment" for rear camera) */
  capture?: "user" | "environment";
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return <ImageIcon size={16} />;
  if (type.startsWith("video/")) return <Video size={16} />;
  return <FileText size={16} />;
}

export default function FileUpload({
  onChange,
  // Extended accept to include HEIC/HEIF (iOS camera) and common camera video formats
  accept = "image/*,video/*,.pdf,image/heic,image/heif,image/heif-sequence,video/quicktime",
  maxFiles = 10,
  capture,
  value,
}: FileUploadProps) {
  const [items, setItems] = useState<FileItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value && value.length > 0 && items.length === 0) {
      const newItems: FileItem[] = value.map(file => {
        const resolvedMime = resolveMimeType(file);
        return {
          file,
          preview: resolvedMime.startsWith("image/") ? URL.createObjectURL(file) : undefined,
          originalSize: file.size,
          compressed: false,
        };
      });
      setItems(newItems);
    }
  }, [value, items.length]);

  // The limit the server can actually take, not a round number: see
  // lib/upload-limit.ts. Refusing here keeps the form intact; refusing on submit
  // is what used to crash the page.
  const validate = (files: File[]): string | null => {
    if (items.length + files.length > maxFiles) return `Maksimal ${maxFiles} berkas.`;
    return uploadBudgetError([...items.map((i) => i.file), ...files]);
  };

  const addFiles = async (rawFiles: File[]) => {
    if (rawFiles.length === 0) return;

    setError(null);
    setIsCompressing(true);

    try {
      // Step 1: Normalize MIME types (fixes empty/wrong types from mobile cameras)
      const normalized = rawFiles.map(normalizeFileType);

      // Step 2: Compress images; videos pass through unchanged (lib/compress.ts)
      // Process sequentially to prevent mobile browsers from crashing due to memory limits (OOM)
      const compressed: File[] = [];
      for (const file of normalized) {
        compressed.push(await compressFile(file));
      }

      // Step 3: Validate total size AFTER compression (more accurate)
      const err = validate(compressed);
      if (err) {
        setError(err);
        return;
      }

      // Step 4: Build preview items
      const newItems: FileItem[] = compressed.map((file, idx) => {
        const originalSize = rawFiles[idx].size;
        const resolvedMime = resolveMimeType(file);
        return {
          file,
          preview: resolvedMime.startsWith("image/")
            ? URL.createObjectURL(file)
            : undefined,
          originalSize,
          compressed: file.size < originalSize * 0.99, // at least 1% smaller
        };
      });

      const updated = [...items, ...newItems];
      setItems(updated);
      onChange(updated.map((i) => i.file));
    } catch (err) {
      console.error("[FileUpload] Compression error:", err);
      setError("Failed to process one or more files. Please try again.");
    } finally {
      setIsCompressing(false);
    }
  };

  const remove = (index: number) => {
    const updated = items.filter((_, i) => i !== index);
    setItems(updated);
    onChange(updated.map((i) => i.file));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void addFiles(Array.from(e.dataTransfer.files));
  };

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void addFiles(Array.from(e.target.files));
    e.target.value = ""; // reset so same file can be re-selected
  };

  return (
    <div>
      {/* Drop zone / Click to browse */}
      <div
        className={`file-upload-area ${dragOver ? "dragover" : ""} ${isCompressing ? "pointer-events-none opacity-60" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !isCompressing && inputRef.current?.click()}
        style={{ cursor: isCompressing ? "wait" : "pointer" }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          onChange={onInput}
          style={{ display: "none" }}
          // capture prop enables direct camera access on mobile
          {...(capture ? { capture } : {})}
        />

        {isCompressing ? (
          <>
            <Loader2
              size={28}
              style={{
                color: "var(--primary)",
                margin: "0 auto 0.5rem",
                animation: "spin 1s linear infinite",
              }}
            />
            <p style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.25rem" }}>
              Memproses berkas…
            </p>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              Foto diperkecil sebelum dikirim
            </p>
          </>
        ) : (
          <>
            <Upload size={32} style={{ color: "var(--primary)", margin: "0 auto 0.5rem", transition: "transform 0.2s ease" }} />
            <p style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.125rem", fontSize: "0.9375rem" }}>
              Drop files here or <span style={{ color: "var(--primary)", textDecoration: "underline", textDecorationStyle: "dotted" }}>click to browse</span>
            </p>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              Foto, video, PDF • Maks. {UPLOAD_BUDGET_MB} MB total
            </p>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "0.25rem",
              marginTop: "0.5rem", padding: "0.2rem 0.6rem",
              background: "rgba(22,70,157,0.08)", color: "var(--primary)",
              borderRadius: "999px", fontSize: "0.72rem", fontWeight: 600,
              border: "1px solid rgba(22,70,157,0.15)",
            }}>
              📎 Tap or click here
            </span>
          </>
        )}
      </div>

      {error && (
        <p className="form-error" style={{ marginTop: "0.5rem" }}>{error}</p>
      )}

      {items.length > 0 && (
        <div className="file-preview-list">
          {items.map((item, i) => {
            const resolvedMime = resolveMimeType(item.file);
            return (
              <div key={i} className="file-preview-item">
                {item.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.preview}
                    alt={item.file.name}
                    style={{
                      width: "2.5rem",
                      height: "2.5rem",
                      objectFit: "cover",
                      borderRadius: "0.375rem",
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "2.5rem",
                      height: "2.5rem",
                      background: "var(--cream)",
                      borderRadius: "0.375rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      color: "var(--text-muted)",
                    }}
                  >
                    {getFileIcon(resolvedMime)}
                  </div>
                )}

                <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                  <p
                    style={{
                      fontWeight: 500,
                      fontSize: "0.875rem",
                      wordBreak: "break-all",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {item.file.name}
                  </p>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {item.compressed && item.originalSize ? (
                      <>
                        <span style={{ textDecoration: "line-through", marginRight: "0.3rem" }}>
                          {formatBytes(item.originalSize)}
                        </span>
                        <span style={{ color: "#16a34a", fontWeight: 600 }}>
                          → {formatBytes(item.file.size)}
                        </span>
                      </>
                    ) : (
                      formatBytes(item.file.size)
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); remove(i); }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    padding: "0.25rem",
                    borderRadius: "0.25rem",
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
