"use client";

import { useRef, useState, useEffect, DragEvent, ChangeEvent } from "react";
import { AlertCircle, Upload, X, FileText, Image as ImageIcon, Video, Loader2, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
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
    // Self-contained (it brings its own data-slot), so it renders the same
    // inside legacy forms and migrated ones.
    <div data-slot="file-upload" className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        onChange={onInput}
        className="hidden"
        // capture prop enables direct camera access on mobile
        {...(capture ? { capture } : {})}
      />

      {/* Drop zone / Click to browse — a real button, so a keyboard reaches it too */}
      <button
        type="button"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !isCompressing && inputRef.current?.click()}
        disabled={isCompressing}
        aria-busy={isCompressing || undefined}
        className={cn(
          "group flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-all outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50",
          dragOver
            ? "border-primary bg-primary/10"
            : "border-border bg-muted/60 hover:border-primary hover:bg-primary/5",
          isCompressing && "cursor-wait opacity-60",
        )}
      >
        {isCompressing ? (
          <>
            <Loader2 aria-hidden="true" className="mb-2 size-7 animate-spin text-primary" />
            <span className="font-semibold text-foreground">Memproses berkas…</span>
            <span className="text-[0.8125rem] text-muted-foreground">Foto diperkecil sebelum dikirim</span>
          </>
        ) : (
          <>
            <Upload aria-hidden="true" className="mb-2 size-8 text-primary transition-transform group-hover:-translate-y-0.5" />
            <span className="text-[0.9375rem] font-bold text-foreground">
              Drop files here or <span className="text-primary underline decoration-dotted">click to browse</span>
            </span>
            <span className="text-[0.8125rem] text-muted-foreground">
              Foto, video, PDF • Maks. {UPLOAD_BUDGET_MB} MB total
            </span>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-primary/15 bg-primary/10 px-2.5 py-0.5 text-[0.72rem] font-semibold text-primary">
              <Paperclip aria-hidden="true" className="size-3" /> Tap or click here
            </span>
          </>
        )}
      </button>

      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item, i) => {
            const resolvedMime = resolveMimeType(item.file);
            return (
              <li
                key={i}
                className="flex items-center gap-3 rounded-lg border-[1.5px] border-border bg-card px-3.5 py-2.5 transition-colors hover:border-primary/40"
              >
                {item.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.preview} alt={item.file.name} className="size-10 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    {getFileIcon(resolvedMime)}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium [overflow-wrap:anywhere]">{item.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.compressed && item.originalSize ? (
                      <>
                        <span className="mr-1 line-through">{formatBytes(item.originalSize)}</span>
                        <span className="font-semibold text-tone-green-fg">→ {formatBytes(item.file.size)}</span>
                      </>
                    ) : (
                      formatBytes(item.file.size)
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); remove(i); }}
                  aria-label={`Hapus ${item.file.name}`}
                  className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:size-8"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
