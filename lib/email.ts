import { Resend } from "resend";

// Resend client — only instantiated if API key is present
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// Use Resend's onboarding sender as fallback — works without a verified domain.
// Once you verify your own domain, set NEXT_PUBLIC_FROM_EMAIL in .env.local.
const FROM_EMAIL =
  process.env.NEXT_PUBLIC_FROM_EMAIL ?? "onboarding@resend.dev";
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// ─── Status display labels (Indonesian) ─────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  waiting: "Menunggu",
  on_progress: "Sedang Dikerjakan",
  done: "Selesai Dikerjakan",
  ready_for_pickup: "Siap Diambil",
  waiting_pickup: "Menunggu Pengambilan",
  handed_to_courier: "Diserahkan ke Kurir",
  delivered: "Terkirim",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  rejected: "Ditolak",
};

// ─── Email milestones: only send for these statuses, skip the rest ───────────
// Prevents email spam for minor intermediate steps.
const EMAIL_MILESTONES = new Set([
  "waiting",          // ticket created
  "on_progress",      // work started
  "done",             // work completed by technician
  "ready_for_pickup", // customer can come pick up
  "handed_to_courier",// sent via courier
  "completed",        // fully done (pickup confirmed / delivered)
]);

// ─── Send ticket status update email ────────────────────────────────────────
export async function sendTicketStatusEmail(opts: {
  to: string;
  customerName: string;
  ticketCode: string;
  status: string;
  shareToken?: string | null;
  message?: string | null;
}): Promise<void> {
  // Only send for milestone statuses — silently skip all others
  if (!EMAIL_MILESTONES.has(opts.status)) return;

  if (!resend) {
    // Resend not configured — log for dev visibility
    console.log(`[EMAIL SKIPPED] To: ${opts.to} | Ticket: ${opts.ticketCode} | Status: ${opts.status}`);
    return;
  }

  const statusLabel = STATUS_LABELS[opts.status] ?? opts.status;
  const ticketUrl = opts.shareToken
    ? `${APP_URL}/ticket/${opts.shareToken}`
    : null;

  const html = buildStatusEmailHtml({
    customerName: opts.customerName,
    ticketCode: opts.ticketCode,
    statusLabel,
    ticketUrl,
    extraMessage: opts.message ?? null,
  });

  try {
    await resend.emails.send({
      from: `HNS IT Center <${FROM_EMAIL}>`,
      to: opts.to,
      subject: `[${opts.ticketCode}] Status Tiket: ${statusLabel}`,
      html,
    });
  } catch (err) {
    // Non-fatal — log but don't throw
    console.error("[EMAIL ERROR]", err);
  }
}

// ─── HTML email template ─────────────────────────────────────────────────────
function buildStatusEmailHtml(opts: {
  customerName: string;
  ticketCode: string;
  statusLabel: string;
  ticketUrl: string | null;
  extraMessage: string | null;
}): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Update Tiket ${opts.ticketCode}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;text-align:center;">
              <div style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">HNS IT Center</div>
              <div style="color:#e0e7ff;font-size:13px;margin-top:4px;">Update Status Tiket</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;color:#374151;font-size:15px;">Halo, <strong>${opts.customerName}</strong></p>
              <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Berikut adalah update terbaru untuk tiket layanan Anda.</p>

              <!-- Ticket code box -->
              <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
                <div style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Nomor Tiket</div>
                <div style="color:#111827;font-size:18px;font-weight:700;">${opts.ticketCode}</div>
              </div>

              <!-- Status box -->
              <div style="background:#ede9fe;border-left:4px solid #7c3aed;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
                <div style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Status Terkini</div>
                <div style="color:#5b21b6;font-size:16px;font-weight:600;">${opts.statusLabel}</div>
              </div>

              ${
                opts.extraMessage
                  ? `<p style="color:#374151;font-size:14px;margin-bottom:24px;">${opts.extraMessage}</p>`
                  : ""
              }

              ${
                opts.ticketUrl
                  ? `<a href="${opts.ticketUrl}" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">Lihat Detail Tiket</a>`
                  : ""
              }
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                Email ini dikirim otomatis oleh sistem HNS IT Center.<br />
                Jangan membalas email ini langsung.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
