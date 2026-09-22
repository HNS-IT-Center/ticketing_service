import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import RmaStatusCard from "@/components/rma/RmaStatusCard";
import RmaActionPanel from "./RmaActionPanel";
import { ArrowLeft, Ticket as TicketIcon } from "lucide-react";

export const metadata = { title: "Detail Case RMA — HNS IT Center" };

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
        },
      },
    },
  });

  if (!rmaCase) notFound();

  const { ticket } = rmaCase;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link
          href="/rma/dashboard"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke antrean
        </Link>
        <h1 className="page-title font-mono">{rmaCase.rma_code}</h1>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
              <TicketIcon className="h-4 w-4" />
              Tiket Asal
            </h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            </dl>

            {rmaCase.purchase_invoice_url && (
              <a
                href={rmaCase.purchase_invoice_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
              >
                Lihat Nota Pembelian
              </a>
            )}
          </section>

          <RmaStatusCard rmaCase={rmaCase} />
        </div>

        <div className="flex flex-col gap-5">
          <RmaActionPanel
            rmaCaseId={rmaCase.id}
            currentStatus={rmaCase.status}
            role={session.role}
          />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`text-sm text-slate-800 break-words ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
