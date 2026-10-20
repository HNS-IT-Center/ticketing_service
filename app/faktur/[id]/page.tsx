import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { accessFor } from "@/lib/access-server";
import { db } from "@/lib/db";
import { loadTicketCharges } from "@/lib/charges-server";
import { formatRupiah } from "@/lib/charges";
import { ticketPartyName } from "@/lib/ticket-party";
import { buildInvoice, invoiceDate, invoiceFormat, printedAt } from "@/lib/invoice";
import PrintButton from "./PrintButton";

export const metadata = { title: "Faktur Service — HNS IT Center" };

/** Where "back to the ticket" goes, by who is printing. */
const TICKET_PAGE: Record<string, string> = {
  Administrator: "/admin/tickets/",
  Technician: "/technician/tickets/",
  Sales: "/sales/tickets/",
};

/**
 * The service invoice the customer takes to the cashier.
 *
 * Selling prices only: the lines are loaded without costs, and no vendor is
 * printed — both are the shop's business. Open to whoever holds "Cetak faktur"
 * (print_invoice) in the access settings; a session without it is turned away.
 * A draft — a line without a price, or work still at a vendor — is stamped as
 * such on paper.
 */
export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const session = await requireSession();
  if (!(await accessFor(session.userId)).can("print_invoice")) redirect("/unauthorized");

  const { id } = await params;
  const format = invoiceFormat((await searchParams).format);

  const ticket = await db.ticket.findFirst({
    where: { OR: [{ id }, { ticket_code: id }] },
    select: {
      id: true,
      ticket_code: true,
      ticket_type: true,
      created_at: true,
      is_for_self: true,
      customer_name: true,
      customer_phone: true,
      device_name: true,
      device_sku: true,
      device_sn: true,
      checking_fee: true,
      user: { select: { name: true, phone_number: true } },
      technician: { select: { name: true } },
      store_location: { select: { name: true, address: true } },
    },
  });
  if (!ticket || ticket.ticket_type !== "service") notFound();

  const [rows, firstDone] = await Promise.all([
    loadTicketCharges(ticket.id, false),
    db.ticketStatusLog.findFirst({
      where: { ticket_id: ticket.id, new_status: "done" },
      orderBy: { created_at: "asc" },
      select: { created_at: true },
    }),
  ]);
  const invoice = buildInvoice(rows);
  const customer = ticketPartyName(ticket) ?? "—";
  const phone = ticket.customer_phone || (ticket.is_for_self ? ticket.user?.phone_number : null) || null;
  const struk = format === "struk";
  const href = (f: string) => `/faktur/${ticket.id}${f === "a4" ? "" : `?format=${f}`}`;
  const backTo = TICKET_PAGE[session.role] ? `${TICKET_PAGE[session.role]}${ticket.id}` : null;

  return (
    <main className={`inv-root ${struk ? "inv-struk" : "inv-a4"}`}>
      <style>{INVOICE_CSS + (struk ? PAGE_STRUK : PAGE_A4)}</style>

      <div className="inv-toolbar no-print">
        {backTo ? (
          <Link href={backTo} className="btn btn-ghost btn-sm" prefetch={false}>
            ← Tiket
          </Link>
        ) : (
          <span />
        )}
        <div className="inv-formats">
          <Link href={href("a4")} className={`btn btn-sm ${struk ? "btn-secondary" : "btn-primary"}`}>
            A4
          </Link>
          <Link href={href("struk")} className={`btn btn-sm ${struk ? "btn-primary" : "btn-secondary"}`}>
            Struk 80 mm
          </Link>
        </div>
        <PrintButton />
      </div>

      {(invoice.isDraft || ticket.checking_fee !== null) && (
        <div className="inv-notes no-print">
          {invoice.reasons.map((r) => (
            <p key={r}>⚠ {r} Faktur tercetak sebagai DRAF sampai dilengkapi di Rincian Biaya.</p>
          ))}
          {ticket.checking_fee !== null && (
            <p>
              ℹ Tiket ini mencatat biaya cek {formatRupiah(Number(ticket.checking_fee))} saat intake. Biaya itu tidak otomatis
              masuk faktur — tambahkan jasa &ldquo;Diagnosa / Pengecekan&rdquo; di Rincian Biaya bila ditagihkan.
            </p>
          )}
        </div>
      )}

      <article className="inv-sheet">
        {invoice.isDraft && <div className="inv-draft">DRAF — BELUM FINAL</div>}

        <header className="inv-head">
          <div className="inv-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-hns.jpg" alt="HNS IT Center" className="inv-logo" />
            <div>
              <div className="inv-shop">HNS IT Center</div>
              {ticket.store_location && (
                <div className="inv-muted">
                  {ticket.store_location.name}
                  {ticket.store_location.address ? ` — ${ticket.store_location.address}` : ""}
                </div>
              )}
            </div>
          </div>
          <div className="inv-title-block">
            <div className="inv-title">FAKTUR SERVICE</div>
            <div className="inv-code">{ticket.ticket_code}</div>
          </div>
        </header>

        <section className="inv-meta">
          <div>
            <div className="inv-label">Customer</div>
            <div className="inv-strong">{customer}</div>
            {phone && <div>{phone}</div>}
          </div>
          <div>
            <div className="inv-label">Unit</div>
            <div className="inv-strong">{ticket.device_name || "—"}</div>
            {ticket.device_sku && <div className="inv-muted">SKU {ticket.device_sku}</div>}
            {ticket.device_sn && <div className="inv-muted">SN {ticket.device_sn}</div>}
          </div>
          <div>
            <div className="inv-label">Tanggal</div>
            <div>Masuk: {invoiceDate(ticket.created_at)}</div>
            {firstDone && <div>Selesai: {invoiceDate(firstDone.created_at)}</div>}
            {ticket.technician && <div className="inv-muted">Teknisi: {ticket.technician.name}</div>}
          </div>
        </section>

        <table className="inv-table">
          <thead>
            <tr>
              {!struk && <th className="inv-no">No</th>}
              {!struk && <th className="inv-code-col">Kode</th>}
              <th>Keterangan</th>
              <th className="inv-num">Qty</th>
              {!struk && <th className="inv-num">Harga</th>}
              <th className="inv-num">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.length === 0 ? (
              <tr>
                <td colSpan={struk ? 3 : 6} className="inv-muted">
                  Belum ada biaya.
                </td>
              </tr>
            ) : (
              invoice.lines.map((l) => (
                <tr key={l.no}>
                  {!struk && <td className="inv-no">{l.no}</td>}
                  {!struk && <td className="inv-code-col">{l.code ?? "—"}</td>}
                  <td>
                    {struk && <div className="inv-code-col">{l.code ?? "—"}</div>}
                    {l.description}
                    {struk && l.unitPrice !== null && l.quantity > 1 && (
                      <div className="inv-muted">
                        {l.quantity} × {formatRupiah(l.unitPrice)}
                      </div>
                    )}
                  </td>
                  <td className="inv-num">{l.quantity}</td>
                  {!struk && <td className="inv-num">{l.unitPrice === null ? "—" : formatRupiah(l.unitPrice)}</td>}
                  <td className="inv-num">{l.amount === null ? "belum ada harga" : formatRupiah(l.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={struk ? 2 : 5} className="inv-total-label">
                TOTAL
              </td>
              <td className="inv-num inv-total">{formatRupiah(invoice.total)}</td>
            </tr>
          </tfoot>
        </table>

        {!struk && (
          <section className="inv-sign">
            <div>
              <div className="inv-label">Customer</div>
              <div className="inv-sign-line" />
              <div>{customer}</div>
            </div>
            <div>
              <div className="inv-label">Kasir</div>
              <div className="inv-sign-line" />
              <div className="inv-muted">Nama &amp; paraf</div>
            </div>
          </section>
        )}

        <footer className="inv-foot">
          <div className="inv-muted">Kode = nomor barang/jasa di Accurate untuk kasir. &ldquo;—&rdquo; dipilih langsung di Accurate.</div>
          <div>Terima kasih telah mempercayakan service Anda kepada HNS IT Center.</div>
          <div className="inv-muted">Dicetak {printedAt()}</div>
        </footer>
      </article>
    </main>
  );
}

const PAGE_A4 = `@page { size: A4; margin: 14mm; }`;
const PAGE_STRUK = `@page { size: 80mm auto; margin: 3mm; }`;

const INVOICE_CSS = `
.inv-root { min-height: 100vh; background: #eef0f3; padding: 1.25rem 1rem 3rem; color: #111827; font-size: 14px; }
.inv-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; max-width: 794px; margin: 0 auto 1rem; }
.inv-struk .inv-toolbar, .inv-struk .inv-notes { max-width: 340px; }
.inv-formats { display: flex; gap: 0.5rem; }
.inv-notes { max-width: 794px; margin: 0 auto 1rem; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 10px; padding: 0.75rem 1rem; display: flex; flex-direction: column; gap: 0.35rem; font-size: 13px; }
.inv-notes p { margin: 0; }
.inv-sheet { position: relative; background: #fff; margin: 0 auto; box-shadow: 0 6px 24px rgba(0,0,0,0.08); border-radius: 6px; }
.inv-a4 .inv-sheet { max-width: 794px; padding: 40px 44px; }
.inv-struk .inv-sheet { max-width: 302px; padding: 14px 12px; font-size: 12px; }
.inv-draft { border: 2px solid #b91c1c; color: #b91c1c; font-weight: 800; letter-spacing: 0.1em; padding: 6px 10px; border-radius: 6px; text-align: center; font-size: 13px; margin-bottom: 14px; }
.inv-struk .inv-draft { font-size: 11px; padding: 4px 6px; margin-bottom: 8px; }
.inv-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #111827; padding-bottom: 14px; }
.inv-struk .inv-head { flex-direction: column; align-items: center; text-align: center; gap: 6px; padding-bottom: 8px; border-bottom-style: dashed; border-bottom-width: 1px; }
.inv-brand { display: flex; align-items: center; gap: 12px; }
.inv-struk .inv-brand { flex-direction: column; gap: 4px; }
.inv-logo { width: 46px; height: 46px; object-fit: cover; border-radius: 8px; }
.inv-struk .inv-logo { width: 34px; height: 34px; }
.inv-shop { font-weight: 800; font-size: 18px; }
.inv-struk .inv-shop { font-size: 15px; }
.inv-title-block { text-align: right; }
.inv-struk .inv-title-block { text-align: center; }
.inv-title { font-weight: 800; letter-spacing: 0.08em; font-size: 16px; }
.inv-code { font-family: ui-monospace, Menlo, Consolas, monospace; font-weight: 700; margin-top: 2px; }
.inv-meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; padding: 16px 0; }
.inv-struk .inv-meta { grid-template-columns: 1fr; gap: 6px; padding: 8px 0; border-bottom: 1px dashed #9ca3af; }
.inv-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; font-weight: 700; margin-bottom: 2px; }
.inv-strong { font-weight: 700; word-break: break-word; }
.inv-muted { color: #6b7280; font-size: 12px; }
.inv-table { width: 100%; border-collapse: collapse; margin-top: 4px; }
.inv-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #374151; border-bottom: 1px solid #111827; padding: 8px 6px; background: none; }
.inv-table td { padding: 8px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; color: #111827; }
.inv-struk .inv-table th, .inv-struk .inv-table td { padding: 5px 2px; }
.inv-table tbody tr:hover { background: none; }
.inv-no { width: 32px; color: #6b7280; }
.inv-code-col { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; color: #374151; white-space: nowrap; }
.inv-struk .inv-code-col { font-size: 11px; color: #6b7280; }
.inv-num { text-align: right; white-space: nowrap; }
.inv-total-label { text-align: right; font-weight: 800; letter-spacing: 0.06em; border-bottom: none; padding-top: 12px; }
.inv-total { font-weight: 800; font-size: 16px; border-bottom: none; padding-top: 12px; }
.inv-sign { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 40px; }
.inv-sign-line { border-bottom: 1px solid #111827; height: 56px; margin-bottom: 6px; }
.inv-foot { margin-top: 28px; text-align: center; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.inv-struk .inv-foot { margin-top: 12px; border-top: 1px dashed #9ca3af; padding-top: 8px; }
@media (max-width: 640px) { .inv-meta { grid-template-columns: 1fr; } .inv-a4 .inv-sheet { padding: 22px 16px; } }
@media print {
  html, body { background: #fff !important; }
  .no-print { display: none !important; }
  .inv-root { background: #fff; padding: 0; min-height: 0; }
  .inv-sheet { box-shadow: none; border-radius: 0; max-width: none; padding: 0; }
  .inv-struk .inv-sheet { padding: 0; }
}
`;
