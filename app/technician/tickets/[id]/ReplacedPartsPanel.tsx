"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Wrench, Plus, Trash2, Camera, X } from "lucide-react";
import type { ServicePart } from "@prisma/client";
import {
  MAX_PART_PHOTOS,
  SERVICE_PART_ORDER,
  requiresItemName,
  servicePartLabel,
} from "@/lib/service-parts";
import {
  addReplacedPartAction,
  removeReplacedPartAction,
} from "@/app/actions/technician";

export type ReplacedPartRow = {
  id: string;
  part: ServicePart;
  item_name: string | null;
  notes: string | null;
  recorded_by_name: string;
  created_at: string;
  photos: { id: string; file_url: string }[];
};

/**
 * Parts replaced during a service, recorded by the technician holding the
 * ticket.
 *
 * The category is a picker and the item name is free text beside it, never
 * instead of it. Typing "ganti baterai" into one box would make the record
 * unreadable to any report — the same fault that forced the dashboard's brand
 * chart to be withdrawn, where "ASUS ROG" and "ROG JANGKAR" counted as two
 * manufacturers.
 */
export default function ReplacedPartsPanel({
  ticketId,
  parts,
  canEdit,
}: {
  ticketId: string;
  parts: ReplacedPartRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [part, setPart] = useState<ServicePart>("lcd");
  const [itemName, setItemName] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [isPending, startTransition] = useTransition();

  const nameRequired = requiresItemName(part);
  const canSubmit = !nameRequired || itemName.trim().length > 0;

  const pickPhotos = (chosen: FileList | null) => {
    if (!chosen) return;
    const next = [...photos, ...Array.from(chosen)].slice(0, MAX_PART_PHOTOS);
    if (photos.length + chosen.length > MAX_PART_PHOTOS) {
      toast.error(`Maksimal ${MAX_PART_PHOTOS} foto per part.`);
    }
    setPhotos(next);
  };

  const add = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("ticket_id", ticketId);
      formData.append("part", part);
      formData.append("item_name", itemName);
      formData.append("notes", notes);
      for (const photo of photos) formData.append("photos", photo);

      const result = await addReplacedPartAction(formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${servicePartLabel(part)} dicatat.`);
      setItemName("");
      setNotes("");
      setPhotos([]);
      router.refresh();
    });
  };

  const remove = (id: string, label: string) => {
    startTransition(async () => {
      const result = await removeReplacedPartAction(id);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${label} dihapus dari catatan.`);
      router.refresh();
    });
  };

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
        <Wrench size={16} style={{ color: "var(--primary-brand)" }} />
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Part yang Diganti</h3>
        {parts.length > 0 && (
          <span
            style={{
              background: "var(--cream)",
              border: "1px solid var(--border-brand)",
              borderRadius: "999px",
              padding: "0.1rem 0.55rem",
              fontSize: "0.71875rem",
              fontWeight: 700,
              color: "var(--text-secondary)",
            }}
          >
            {parts.length}
          </span>
        )}
      </div>
      <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: "0 0 1rem" }}>
        Pilih jenis part-nya, lalu tulis nama barang yang dipasang. Jenisnya yang nanti bisa
        dihitung di laporan; nama barangnya untuk catatan.
      </p>

      {parts.length === 0 ? (
        <p
          style={{
            fontSize: "0.8125rem",
            color: "var(--text-muted)",
            fontStyle: "italic",
            margin: "0 0 1rem",
          }}
        >
          Belum ada part yang dicatat.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: "0 0 1rem", padding: 0 }}>
          {parts.map((row) => (
            <li
              key={row.id}
              style={{
                display: "flex",
                gap: "0.75rem",
                alignItems: "flex-start",
                justifyContent: "space-between",
                padding: "0.7rem 0",
                borderTop: "1px solid var(--border-light)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", alignItems: "center" }}>
                  <span
                    style={{
                      background: "#dbeafe",
                      color: "#1e40af",
                      border: "1px solid #bfdbfe",
                      borderRadius: "999px",
                      padding: "0.1rem 0.6rem",
                      fontSize: "0.71875rem",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {servicePartLabel(row.part)}
                  </span>
                  {row.item_name && (
                    <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>{row.item_name}</span>
                  )}
                </div>
                {row.notes && (
                  <p
                    style={{
                      margin: "0.4rem 0 0",
                      fontSize: "0.8125rem",
                      color: "var(--text-secondary)",
                      wordBreak: "break-word",
                    }}
                  >
                    {row.notes}
                  </p>
                )}
                {row.photos.length > 0 && (
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                    {row.photos.map((photo) => (
                      <a
                        key={photo.id}
                        href={photo.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: "block", lineHeight: 0 }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.file_url}
                          alt={`Foto ${servicePartLabel(row.part)}`}
                          style={{
                            width: "58px",
                            height: "58px",
                            objectFit: "cover",
                            borderRadius: "8px",
                            border: "1px solid var(--border-brand)",
                          }}
                        />
                      </a>
                    ))}
                  </div>
                )}
                <p style={{ margin: "0.3rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {row.recorded_by_name} · {row.created_at}
                </p>
              </div>

              {canEdit && (
                <button
                  type="button"
                  onClick={() => remove(row.id, servicePartLabel(row.part))}
                  disabled={isPending}
                  aria-label={`Hapus catatan ${servicePartLabel(row.part)}`}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border-brand)",
                    borderRadius: "8px",
                    minHeight: "36px",
                    minWidth: "36px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#991b1b",
                    cursor: isPending ? "not-allowed" : "pointer",
                    flexShrink: 0,
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div
          style={{
            borderTop: "1px solid var(--border-light)",
            paddingTop: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "0.75rem",
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Jenis part</span>
              <select
                value={part}
                onChange={(e) => setPart(e.target.value as ServicePart)}
                className="form-input"
              >
                {SERVICE_PART_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {servicePartLabel(p)}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                Nama barang{" "}
                {nameRequired ? (
                  <span style={{ color: "#991b1b" }}>*</span>
                ) : (
                  <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(opsional)</span>
                )}
              </span>
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                className="form-input"
                placeholder="Contoh: Baterai ASUS C31N1915"
              />
            </label>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
              Catatan <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(opsional)</span>
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="form-input"
              placeholder="Kenapa diganti, kondisi part lamanya"
              style={{ resize: "vertical" }}
            />
          </label>

          <div>
            <span style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.35rem" }}>
              Foto part{" "}
              <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                (opsional, maks {MAX_PART_PHOTOS}) — biasanya dus dan label namanya
              </span>
            </span>

            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                minHeight: "44px",
                padding: "0 1rem",
                borderRadius: "10px",
                border: "1px dashed var(--border-brand)",
                background: "var(--cream)",
                fontSize: "0.84375rem",
                fontWeight: 600,
                color: "var(--text-secondary)",
                cursor: photos.length >= MAX_PART_PHOTOS ? "not-allowed" : "pointer",
                opacity: photos.length >= MAX_PART_PHOTOS ? 0.6 : 1,
              }}
            >
              <Camera size={16} />
              {photos.length === 0 ? "Pilih foto" : `Tambah foto (${photos.length}/${MAX_PART_PHOTOS})`}
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={photos.length >= MAX_PART_PHOTOS}
                onChange={(e) => {
                  pickPhotos(e.target.files);
                  e.target.value = "";
                }}
                style={{ display: "none" }}
              />
            </label>

            {photos.length > 0 && (
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
                {photos.map((file, i) => (
                  <span
                    key={`${file.name}-${i}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      background: "var(--cream)",
                      border: "1px solid var(--border-brand)",
                      borderRadius: "999px",
                      padding: "0.25rem 0.5rem 0.25rem 0.75rem",
                      fontSize: "0.78125rem",
                      maxWidth: "100%",
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "180px",
                      }}
                    >
                      {file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                      aria-label={`Buang ${file.name}`}
                      style={{
                        background: "transparent",
                        border: 0,
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        display: "flex",
                        padding: 0,
                      }}
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={add}
              disabled={!canSubmit || isPending}
              className="btn btn-primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                opacity: canSubmit && !isPending ? 1 : 0.6,
                cursor: canSubmit && !isPending ? "pointer" : "not-allowed",
              }}
            >
              <Plus size={15} />
              {isPending ? "Menyimpan…" : "Tambah part"}
            </button>
            {nameRequired && !canSubmit && (
              <span style={{ marginLeft: "0.6rem", fontSize: "0.78125rem", color: "#991b1b" }}>
                Nama barang wajib diisi bila jenis part-nya Lainnya.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
