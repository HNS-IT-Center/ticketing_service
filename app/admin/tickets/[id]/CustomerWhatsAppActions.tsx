"use client";

import { MessageCircle } from "lucide-react";


interface Props {
  customerPhone: string;
  customerName: string;
  ticketCode: string;
  status: string;
  publicLink: string | null;
}

export default function CustomerWhatsAppActions({ customerPhone, customerName, ticketCode, status, publicLink }: Props) {
  if (!customerPhone) return null;

  const phoneStr = customerPhone.replace(/\D/g, "");

  const sendWa = (text: string) => {
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/${phoneStr}?text=${encoded}`, "_blank");
  };

  const templates = [
    {
      label: "Halo / Follow Up",
      text: `Halo kak ${customerName}, saya dari HNS IT Center terkait tiket ${ticketCode}. Apakah ada waktu untuk berdiskusi terkait perangkat kakak?`
    },
    {
      label: "Tunggu Diambil",
      text: `Halo kak ${customerName}, perangkat kakak dengan nomor tiket ${ticketCode} sudah selesai dikerjakan dan siap diambil di toko. Terima kasih!\n\nCek detail: ${publicLink ? `http://localhost:3000/ticket/${publicLink}` : ''}`
    },
    {
      label: "Dikirim Kurir",
      text: `Halo kak ${customerName}, perangkat kakak dengan nomor tiket ${ticketCode} sedang dalam perjalanan dikirim oleh kurir kami. Mohon ditunggu ya kak!\n\nCek detail: ${publicLink ? `http://localhost:3000/ticket/${publicLink}` : ''}`
    },
    {
      label: "Minta Persetujuan (Approval)",
      text: `Halo kak ${customerName}, terkait perangkat dengan nomor tiket ${ticketCode}, kami membutuhkan persetujuan kakak sebelum melanjutkan perbaikan. Mohon informasinya ya kak.\n\nCek detail: ${publicLink ? `http://localhost:3000/ticket/${publicLink}` : ''}`
    }
  ];

  return (
    <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-gray-100">
      <div className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1">
        <MessageCircle size={14} /> WhatsApp Quick Actions
      </div>
      <div className="flex flex-wrap gap-2">
        {templates.map((t, idx) => (
          <button 
            key={idx} 
            type="button"
            className="btn btn-outline" 
            style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
            onClick={() => sendWa(t.text)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
