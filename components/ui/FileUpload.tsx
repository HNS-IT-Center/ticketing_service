"use client";

import { useRef, useState, DragEvent, ChangeEvent } from "react";
import { Upload, X, FileText, Image as ImageIcon, Video } from "lucide-react";

interface FileItem {
  file: File;
  preview?: string;
}

interface FileUploadProps {
  onChange: (files: File[]) => void;
  accept?: string;
  maxSizeMB?: number;
  maxFiles?: number;
}

const MAX_SIZE_BYTES = 64 * 1024 * 1024; // 64MB

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return <ImageIcon size={16} />;
  if (type.startsWith("video/")) return <Video size={16} />;
  return <FileText size={16} />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FileUpload({
  onChange,
  accept = "image/*,video/*,.pdf",
  maxSizeMB = 64,
  maxFiles = 10,
}: FileUploadProps) {
  const [items, setItems] = useState<FileItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = (files: File[]): string | null => {
    const totalSize = [...items.map((i) => i.file), ...files].reduce(
      (acc, f) => acc + f.size,
      0
    );
    if (totalSize > MAX_SIZE_BYTES)
      return `Total size exceeds ${maxSizeMB}MB limit`;
    if (items.length + files.length > maxFiles)
      return `Maximum ${maxFiles} files allowed`;
    return null;
  };

  const addFiles = (files: File[]) => {
    const err = validate(files);
    if (err) { setError(err); return; }
    setError(null);
    const newItems: FileItem[] = files.map((file) => ({
      file,
      preview: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined,
    }));
    const updated = [...items, ...newItems];
    setItems(updated);
    onChange(updated.map((i) => i.file));
  };

  const remove = (index: number) => {
    const updated = items.filter((_, i) => i !== index);
    setItems(updated);
    onChange(updated.map((i) => i.file));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = "";
  };

  return (
    <div>
      <div
        className={`file-upload-area ${dragOver ? "dragover" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          onChange={onInput}
          style={{ display: "none" }}
        />
        <Upload size={28} style={{ color: "var(--primary)", margin: "0 auto 0.5rem" }} />
        <p style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.25rem" }}>
          Drop files here or click to browse
        </p>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
          Images, Videos, PDFs • Max {maxSizeMB}MB total
        </p>
      </div>

      {error && (
        <p className="form-error" style={{ marginTop: "0.5rem" }}>{error}</p>
      )}

      {items.length > 0 && (
        <div className="file-preview-list">
          {items.map((item, i) => (
            <div key={i} className="file-preview-item">
              {item.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.preview}
                  alt={item.file.name}
                  style={{ width: "2.5rem", height: "2.5rem", objectFit: "cover", borderRadius: "0.375rem", flexShrink: 0 }}
                />
              ) : (
                <div style={{ width: "2.5rem", height: "2.5rem", background: "var(--cream)", borderRadius: "0.375rem", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--text-muted)" }}>
                  {getFileIcon(item.file.type)}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                <p style={{ fontWeight: 500, fontSize: "0.875rem", wordBreak: "break-all", overflowWrap: "anywhere" }}>
                  {item.file.name}
                </p>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {formatBytes(item.file.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(i); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "0.25rem", borderRadius: "0.25rem" }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
