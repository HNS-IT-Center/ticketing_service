"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { checkTicketDeletionAction, deleteTicketAction } from "@/app/actions/admin";

type Inventory = Awaited<ReturnType<typeof checkTicketDeletionAction>>;

/**
 * Permanent ticket deletion, for administrators.
 *
 * The dialog exists to make an irreversible action legible, not to slow it
 * down for its own sake. Before anything is destroyed it asks the server what
 * would go — status logs, messages, attachments, time logs, the RMA case and
 * its events — and prints the counts, because "are you sure?" over an unknown
 * quantity is not a question anyone can answer.
 *
 * Typing the ticket code is required. It is the one guard that cannot be
 * cleared by a mis-click, and the server checks it again: a confirmation only
 * the browser enforces is not a confirmation.
 */
export default function DeleteTicketPanel({
  ticketId,
  ticketCode,
}: {
  ticketId: string;
  ticketCode: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const openDialog = async () => {
    setOpen(true);
    setLoading(true);
    try {
      setInventory(await checkTicketDeletionAction(ticketId));
    } catch {
      toast.error("Gagal memuat rincian tiket.");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    setOpen(false);
    setInventory(null);
    setReason("");
    setConfirmation("");
  };

  const canDelete = reason.trim().length > 0 && confirmation.trim() === ticketCode;

  const submit = () => {
    startTransition(async () => {
      const result = await deleteTicketAction(ticketId, reason, confirmation);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Tiket ${result?.ticketCode} dihapus permanen.`);
      router.push("/admin/tickets");
      router.refresh();
    });
  };

  const destroys = inventory && "destroys" in inventory ? inventory.destroys : null;
  const credits = inventory && "credits" in inventory ? inventory.credits : null;

  return (
    <>
      <div className="card" style={{ borderColor: "#fecaca" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
          <AlertTriangle size={16} style={{ color: "#991b1b" }} />
          <h3 style={{ margin: 0, fontSize: "1rem", color: "#991b1b" }}>Zona Berbahaya</h3>
        </div>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: "0 0 1rem" }}>
          Menghapus tiket bersifat <strong>permanen</strong> dan ikut membawa seluruh riwayat
          status, pesan, lampiran, dan case RMA-nya. Tidak bisa dibatalkan.
        </p>
        <button
          type="button"
          onClick={openDialog}
          className="btn"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            background: "#991b1b",
            borderColor: "#991b1b",
            color: "#ffffff",
          }}
        >
          <Trash2 size={15} />
          Hapus tiket ini
        </button>
      </div>

      {open && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Hapus tiket ${ticketCode}`}
        >
          <div className="modal" style={{ maxWidth: "540px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.0625rem", color: "#991b1b" }}>
                Hapus {ticketCode} permanen
              </h3>
              <button
                type="button"
                onClick={close}
                aria-label="Tutup"
                style={{
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  display: "flex",
                }}
              >
                <X size={18} />
              </button>
            </div>

            {loading && (
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                Menghitung yang akan ikut terhapus…
              </p>
            )}

            {destroys && (
              <>
                <div
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: "10px",
                    padding: "0.85rem 1rem",
                    marginBottom: "1rem",
                  }}
                >
                  <p style={{ margin: "0 0 0.6rem", fontSize: "0.8125rem", fontWeight: 700, color: "#7f1d1d" }}>
                    Yang ikut terhapus dan tidak bisa dikembalikan:
                  </p>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: "1.1rem",
                      fontSize: "0.8125rem",
                      color: "#7f1d1d",
                      lineHeight: 1.7,
                    }}
                  >
                    <li>{destroys.statusLogs} baris riwayat status</li>
                    <li>{destroys.messages} pesan</li>
                    <li>{destroys.attachments} lampiran (berkasnya ikut dihapus dari storage)</li>
                    <li>{destroys.timeLogs} catatan waktu kerja</li>
                    {destroys.rmaCode && (
                      <li>
                        <strong>Case RMA {destroys.rmaCode}</strong> beserta {destroys.rmaEvents}{" "}
                        riwayat perpindahan statusnya
                      </li>
                    )}
                  </ul>
                </div>

                {credits && credits.earningLogs + credits.failureLogs > 0 && (
                  <div
                    style={{
                      background: "#fef3c7",
                      border: "1px solid #fde68a",
                      borderRadius: "10px",
                      padding: "0.85rem 1rem",
                      marginBottom: "1rem",
                      fontSize: "0.8125rem",
                      color: "#7c2d12",
                    }}
                  >
                    Poin teknisi akan dikembalikan: <strong>−{credits.points} poin</strong>,{" "}
                    {credits.earningLogs} tiket sukses dan {credits.failureLogs} gagal dikurangi
                    dari catatan performanya, supaya leaderboard dan profil tetap sama angkanya.
                  </div>
                )}

                <label style={{ display: "block", marginBottom: "1rem" }}>
                  <span style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                    Alasan penghapusan <span style={{ color: "#991b1b" }}>*</span>
                  </span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    className="form-input"
                    placeholder="Contoh: salah input saat intake, tiket ganda"
                    style={{ width: "100%", resize: "vertical" }}
                  />
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    Disimpan beserta nama kamu di catatan penghapusan.
                  </span>
                </label>

                <label style={{ display: "block", marginBottom: "1.25rem" }}>
                  <span style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                    Ketik <code style={{ fontFamily: "ui-monospace, monospace" }}>{ticketCode}</code>{" "}
                    untuk mengonfirmasi <span style={{ color: "#991b1b" }}>*</span>
                  </span>
                  <input
                    type="text"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    className="form-input"
                    autoComplete="off"
                    style={{ width: "100%", fontFamily: "ui-monospace, monospace" }}
                  />
                </label>

                <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <button type="button" onClick={close} className="btn btn-outline" disabled={isPending}>
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!canDelete || isPending}
                    className="btn"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      background: canDelete ? "#991b1b" : "#d1d5db",
                      borderColor: canDelete ? "#991b1b" : "#d1d5db",
                      color: "#ffffff",
                      cursor: canDelete && !isPending ? "pointer" : "not-allowed",
                    }}
                  >
                    <Trash2 size={15} />
                    {isPending ? "Menghapus…" : "Hapus permanen"}
                  </button>
                </div>
              </>
            )}

            {inventory && "error" in inventory && inventory.error && (
              <p style={{ fontSize: "0.875rem", color: "#991b1b", margin: 0 }}>{inventory.error}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
