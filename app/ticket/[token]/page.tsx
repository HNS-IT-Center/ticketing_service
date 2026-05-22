import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Badge from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/utils";
import PublicShareButton from "./PublicShareButton";
import PublicChat from "./PublicChat";

export const metadata = { title: "Ticket Status — HNS IT Center" };

export default async function PublicTicketPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const ticket = await db.ticket.findUnique({
    where: { public_share_token: token },
    include: {
      user: { select: { name: true } },
      store_location: { select: { name: true, code: true } },
      status_logs: {
        orderBy: { created_at: "asc" },
        include: { changer: { select: { name: true, role: true } } },
      },
      messages: {
        where: { /* only show messages if public chat is enabled — checked below */ },
        orderBy: { created_at: "asc" },
        include: { sender: { select: { name: true, role: true } } },
      },
      time_logs: { orderBy: { created_at: "asc" } },
    },
  });

  if (!ticket) notFound();

  const STATUS_STEPS = [
    { key: "waiting", label: "Diterima" },
    { key: "on_progress", label: "Sedang Dikerjakan" },
    { key: "done", label: "Selesai Dikerjakan" },
    { key: "ready_for_pickup", label: "Siap Diambil" },
    { key: "handed_to_courier", label: "Ke Kurir" },
    { key: "delivered", label: "Terkirim" },
    { key: "completed", label: "Selesai" },
  ];

  const currentIdx = STATUS_STEPS.findIndex((s) => s.key === ticket.status);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const shareUrl = `${appUrl}/ticket/${token}`;

  let totalTimeMs = 0;
  let lastStartTime: Date | null = null;
  for (const log of ticket.time_logs) {
    if (log.event === "START" || log.event === "RESUME") {
      lastStartTime = log.created_at;
    } else if ((log.event === "PAUSE" || log.event === "DONE") && lastStartTime) {
      totalTimeMs += log.created_at.getTime() - lastStartTime.getTime();
      lastStartTime = null;
    }
  }
  // If still actively working, add time up to now
  if (lastStartTime && ticket.status === "on_progress" && !ticket.time_logs.find(l => l.event === "PAUSE" && l.created_at > lastStartTime!)) {
    totalTimeMs += Date.now() - lastStartTime.getTime();
  }

  const formatDuration = (ms: number) => {
    if (ms === 0) return "Belum dimulai";
    const mins = Math.floor(ms / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days} Hari ${hours % 24} Jam`;
    if (hours > 0) return `${hours} Jam ${mins % 60} Menit`;
    return `${mins} Menit`;
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #f0f4ff 0%, #faf5ff 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "2rem 1rem",
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: "600px", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Header */}
        <div style={{ textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-hns.jpg" alt="HNS IT Center" style={{ width: "48px", height: "48px", borderRadius: "10px", objectFit: "cover", marginBottom: "0.75rem" }} />
          <div style={{ fontWeight: 700, fontSize: "1.125rem", color: "#1f2937" }}>HNS IT Center</div>
          <div style={{ fontSize: "0.8125rem", color: "#6b7280", marginTop: "0.25rem" }}>Ticket Status Tracker</div>
        </div>

        {/* Ticket card */}
        <div style={{ background: "#ffffff", borderRadius: "16px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", overflow: "hidden" }}>
          {/* Ticket header */}
          <div style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", padding: "1.5rem 1.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
              <div>
                <div style={{ color: "#e0e7ff", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Nomor Tiket</div>
                <div style={{ color: "#ffffff", fontWeight: 800, fontSize: "1.375rem", fontFamily: "monospace" }}>
                  {ticket.ticket_code}
                </div>
              </div>
              <Badge variant={ticket.status} technicianId={ticket.technician_id} />
            </div>
            {ticket.store_location && (
              <div style={{ marginTop: "0.75rem", color: "#c7d2fe", fontSize: "0.8125rem" }}>
                📍 {ticket.store_location.name}
              </div>
            )}
          </div>

          {/* Ticket info */}
          <div style={{ padding: "1.5rem 1.75rem", borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              {[
                ["Tipe Layanan", ticket.ticket_type.replace(/_/g, " ")],
                ["Kategori", ticket.service_category?.replace(/_/g, " ") ?? "—"],
                ["Perangkat", ticket.device_type.replace(/_/g, " ")],
                ["Dibuat", formatDateTime(ticket.created_at)],
                ["Pengiriman", ticket.pickup_method === "courier" ? "Kurir" : ticket.pickup_method === "self_pickup" ? "Ambil Sendiri" : "—"],
                ["Waktu Kerja Aktif", formatDuration(totalTimeMs)],
                ...(ticket.is_overnight_check ? [["Cek & Diagnosa", "Overnight (Fee Rp. 50,000)"]] : []),
              ].map(([label, value]) => (
                <div key={label as string}>
                  <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginBottom: "0.2rem" }}>{label}</div>
                  <div style={{ fontWeight: 500, color: "#374151", textTransform: "capitalize", fontSize: "0.9rem" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Status timeline */}
          <div style={{ padding: "1.5rem 1.75rem", borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "#111827", marginBottom: "1rem" }}>
              Riwayat Status
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {ticket.status_logs.map((log, i) => (
                <div key={log.id} style={{ display: "flex", gap: "0.875rem", alignItems: "flex-start" }}>
                  <div style={{
                    width: "28px", height: "28px", borderRadius: "50%",
                    background: i === ticket.status_logs.length - 1 ? "#6366f1" : "#e5e7eb",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, marginTop: "2px",
                    color: i === ticket.status_logs.length - 1 ? "white" : "#9ca3af",
                    fontSize: "0.75rem", fontWeight: 700,
                  }}>
                    {i + 1}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: "#374151", fontSize: "0.875rem", textTransform: "capitalize" }}>
                      {log.new_status.replace(/_/g, " ")}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "2px" }}>
                      {formatDateTime(log.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Progress Proof Image */}
          {ticket.progress_proof_url && (
            <div style={{ padding: "1.5rem 1.75rem", borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "#111827", marginBottom: "1rem" }}>
                Bukti Progress / Pengambilan
              </div>
              <img 
                src={ticket.progress_proof_url} 
                alt="Progress Proof" 
                style={{ width: "100%", maxHeight: "300px", objectFit: "cover", borderRadius: "12px", border: "1px solid #e5e7eb" }}
              />
            </div>
          )}

          {/* Share button */}
          <div style={{ padding: "1rem 1.75rem" }}>
            <PublicShareButton url={shareUrl} />
          </div>
        </div>

        {/* Public chat section */}
        {ticket.public_chat_enabled ? (
          <PublicChat
            ticketId={ticket.id}
            shareToken={token}
            messages={ticket.messages.map((m) => ({
              id: m.id,
              message: m.message,
              created_at: m.created_at.toISOString(),
              is_read: m.is_read,
              senderName: m.sender?.name ?? m.sender_name ?? "Anonymous",
              senderRole: m.sender?.role ?? "Customer",
            }))}
          />
        ) : (
          <div style={{ background: "#fff", borderRadius: "12px", padding: "1.25rem 1.5rem", textAlign: "center", color: "#9ca3af", fontSize: "0.875rem", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            💬 Chat dinonaktifkan untuk tiket ini
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", color: "#9ca3af", fontSize: "0.75rem" }}>
          HNS IT Center · Halaman ini hanya-baca dan terisolasi
        </div>
      </div>
    </div>
  );
}
