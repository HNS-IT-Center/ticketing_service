import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import RmaStatusCard, { RmaStatusBadge } from "@/components/rma/RmaStatusCard";
import RmaActionPanel from "./RmaActionPanel";
import FilePreview from "@/components/ui/FilePreview";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Detail Case RMA — HNS IT Center" };

/** Label + value pair, matching the ticket detail pages. */
function Field({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="font-medium" style={{ wordBreak: "break-word", fontFamily: mono ? "ui-monospace, monospace" : undefined }}>
        {value}
      </p>
    </div>
  );
}

const LAMPIRAN_LABEL: Record<string, string> = {
  image: "Foto",
  video: "Video",
  pdf: "Dokumen",
};

export default async function RmaCasePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("RMA", "Administrator");
  const { id } = await params;

  const rmaCase = await db.rmaCase.findUnique({
    where: { id },
    select: {
      id: true,
      rma_code: true,
      status: true,
      unit_ownership: true,
      stock_origin: true,
      purchase_invoice_url: true,
      sn_verified: true,
      physical_condition: true,
      fault_description: true,
      test_result: true,
      hold_reason: true,
      vendor_name: true,
      vendor_rma_number: true,
      shipping_tracking: true,
      submitted_at: true,
      decision: true,
      decision_notes: true,
      replacement_sn: true,
      decided_at: true,
      unit_received_at: true,
      closed_at: true,
      handed_over_at: true,
      handed_over_by: { select: { id: true, name: true } },
      handler: { select: { id: true, name: true } },
      events: {
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          from_status: true,
          to_status: true,
          note: true,
          created_at: true,
          actor: { select: { id: true, name: true } },
        },
      },
      ticket: {
        select: {
          id: true,
          ticket_code: true,
          status: true,
          created_at: true,
          customer_name: true,
          customer_phone: true,
          device_name: true,
          device_sn: true,
          device_type: true,
          notes: true,
          store_location: { select: { name: true, code: true } },
          technician: { select: { id: true, name: true } },
          warranty_detail: { select: { purchase_date: true } },
          // The technician's examination evidence. Without this the RMA desk
          // decides whether to send a unit to a vendor having seen nothing but
          // three lines of typed text.
          attachments: {
            orderBy: { created_at: "asc" },
            select: { id: true, file_url: true, file_type: true, created_at: true },
          },
        },
      },
    },
  });

  // Spellings already in use, offered as suggestions in the vendor field.

  const knownVendors = (

    await db.rmaCase.findMany({

      where: { vendor_name: { not: null } },

      distinct: ["vendor_name"],

      orderBy: { vendor_name: "asc" },

      select: { vendor_name: true },

    })

  ).map((v) => v.vendor_name!).filter(Boolean);


  if (!rmaCase) notFound();

  const { ticket } = rmaCase;

  // The invoice is rendered on its own above; showing it again in the list
  // would just be the same file twice.
  const otherAttachments = ticket.attachments.filter(
    (a) => a.file_url !== rmaCase.purchase_invoice_url
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <Link
            href="/rma/dashboard"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}
          >
            <ArrowLeft size={14} /> Kembali ke antrean
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <h1 style={{ fontSize: "1.25rem", fontFamily: "ui-monospace, monospace" }}>{rmaCase.rma_code}</h1>
            <RmaStatusBadge status={rmaCase.status} />
          </div>
          <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
            Tiket #{ticket.ticket_code} • {ticket.device_type.replace(/_/g, " ")}
          </p>
        </div>
      </div>

      <div className="ticket-detail-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div className="card">
            <h3 style={{ margin: "0 0 1rem" }}>Tiket Asal</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
              <Field label="Kode Tiket" value={ticket.ticket_code} mono />
              <Field label="Status Tiket" value={ticket.status.replace(/_/g, " ")} />
              <Field label="Customer" value={ticket.customer_name} />
              <Field label="Telepon" value={ticket.customer_phone} />
              <Field label="Perangkat" value={ticket.device_name} />
              <Field label="Kategori" value={ticket.device_type.replace(/_/g, " ")} />
              <Field label="Serial Number" value={ticket.device_sn} mono />
              <Field
                label="Tanggal Pembelian"
                value={
                  ticket.warranty_detail
                    ? new Date(ticket.warranty_detail.purchase_date).toLocaleDateString("id-ID")
                    : null
                }
              />
              <Field label="Toko" value={ticket.store_location?.name} />
              <Field label="Teknisi" value={ticket.technician?.name} />
              <Field label="Tiket Dibuat" value={formatDateTime(ticket.created_at)} />
            </div>

            {rmaCase.purchase_invoice_url && (
              <div style={{ marginTop: "1.25rem" }}>
                <FilePreview
                  url={rmaCase.purchase_invoice_url}
                  label="Lihat Nota Pembelian"
                  title={`Nota Pembelian — ${ticket.ticket_code}`}
                />
              </div>
            )}

            {/* Everything attached to the ticket, minus the invoice already
                shown above so it does not appear twice. */}
            {otherAttachments.length > 0 && (
              <div style={{ marginTop: "1.25rem" }}>
                <div style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Lampiran Tiket ({otherAttachments.length})
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {otherAttachments.map((a, i) => (
                    <FilePreview
                      key={a.id}
                      url={a.file_url}
                      fileType={a.file_type}
                      label={`${LAMPIRAN_LABEL[a.file_type] ?? "Lampiran"} ${i + 1}`}
                      title={`Lampiran ${i + 1} — ${ticket.ticket_code}`}
                      className="btn btn-outline"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <RmaStatusCard rmaCase={rmaCase} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <RmaActionPanel
            rmaCaseId={rmaCase.id}
            currentStatus={rmaCase.status}
            role={session.role}
            knownVendors={knownVendors}
          />
        </div>
      </div>
    </div>
  );
}
