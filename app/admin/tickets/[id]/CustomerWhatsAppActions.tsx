"use client";

import { MessageCircle } from "lucide-react";

const WhatsAppIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
  </svg>
);


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

  const appUrl = typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || "");

  const templates = [
    {
      label: "Halo / Follow Up",
      text: `Halo kak ${customerName}, saya dari HNS IT Center terkait tiket ${ticketCode}. Apakah ada waktu untuk berdiskusi terkait perangkat kakak?`
    },
    {
      label: "Tunggu Diambil",
      text: `Halo kak ${customerName}, perangkat kakak dengan nomor tiket ${ticketCode} sudah selesai dikerjakan dan siap diambil di toko. Terima kasih!\n\nCek detail: ${publicLink ? `${appUrl}/${publicLink}` : ''}`
    },
    {
      label: "Dikirim Kurir",
      text: `Halo kak ${customerName}, perangkat kakak dengan nomor tiket ${ticketCode} sedang dalam perjalanan dikirim oleh kurir kami. Mohon ditunggu ya kak!\n\nCek detail: ${publicLink ? `${appUrl}/${publicLink}` : ''}`
    },
    {
      label: "Minta Persetujuan (Approval)",
      text: `Halo kak ${customerName}, terkait perangkat dengan nomor tiket ${ticketCode}, kami membutuhkan persetujuan kakak sebelum melanjutkan perbaikan. Mohon informasinya ya kak.\n\nCek detail: ${publicLink ? `${appUrl}/${publicLink}` : ''}`
    }
  ];

  return (
    <div className="flex flex-col gap-3 mt-8">
      <div className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5" style={{ color: "#25D366" }}>
        <WhatsAppIcon size={16} /> WhatsApp Quick Actions
      </div>
      <div className="flex flex-wrap gap-2">
        {templates.map((t, idx) => (
          <button 
            key={idx} 
            type="button"
            className="btn font-medium transition-colors" 
            style={{ 
              fontSize: "0.75rem", 
              padding: "0.35rem 0.75rem",
              background: "#e8fcf0",
              color: "#1da851",
              border: "1px solid #bbf2d1",
              borderRadius: "0.5rem"
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#d1fae5";
              e.currentTarget.style.borderColor = "#86efac";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "#e8fcf0";
              e.currentTarget.style.borderColor = "#bbf2d1";
            }}
            onClick={() => sendWa(t.text)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
