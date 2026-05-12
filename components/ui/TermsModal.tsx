"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export default function TermsModal() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.875rem 1rem",
          background: "var(--cream)",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "0.9rem",
          fontWeight: 600,
          color: "var(--text-primary)",
        }}
      >
        <span>📄 Syarat &amp; Ketentuan Layanan</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div style={{ padding: "1rem 1.25rem", fontSize: "0.8125rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "0.875rem", background: "var(--white)" }}>
          <section>
            <strong style={{ color: "var(--text-primary)" }}>1. Biaya Pengecekan (Checking Fee)</strong>
            <p style={{ marginTop: "0.25rem" }}>
              Selama masa awal operasional, biaya pengecekan dibebaskan (Rp 0). Kebijakan ini dapat berubah sewaktu-waktu dan akan diinformasikan terlebih dahulu.
            </p>
          </section>

          <section>
            <strong style={{ color: "var(--text-primary)" }}>2. Risiko Data &amp; Perangkat</strong>
            <p style={{ marginTop: "0.25rem" }}>
              HNS IT Center tidak bertanggung jawab atas kehilangan data selama proses servis. Pelanggan disarankan untuk melakukan backup data sebelum menyerahkan perangkat.
            </p>
          </section>

          <section>
            <strong style={{ color: "var(--text-primary)" }}>3. Estimasi Waktu Pengerjaan</strong>
            <p style={{ marginTop: "0.25rem" }}>
              Estimasi waktu yang diberikan bersifat perkiraan dan dapat berubah tergantung kondisi perangkat, ketersediaan komponen, dan antrean servis.
            </p>
          </section>

          <section>
            <strong style={{ color: "var(--text-primary)" }}>4. Barang Tidak Diambil</strong>
            <p style={{ marginTop: "0.25rem" }}>
              Perangkat yang tidak diambil dalam 30 hari kalender setelah pemberitahuan selesai menjadi tanggung jawab pelanggan sepenuhnya. HNS IT Center berhak membuang/mendaur ulang perangkat setelah 60 hari tanpa pemberitahuan lebih lanjut.
            </p>
          </section>

          <section>
            <strong style={{ color: "var(--text-primary)" }}>5. Garansi Servis</strong>
            <p style={{ marginTop: "0.25rem" }}>
              Garansi servis berlaku 7 hari untuk jenis kerusakan yang sama. Garansi tidak mencakup kerusakan akibat penggunaan yang tidak sesuai setelah perangkat diserahkan kembali kepada pelanggan.
            </p>
          </section>

          <section>
            <strong style={{ color: "var(--text-primary)" }}>6. Pengiriman melalui Kurir</strong>
            <p style={{ marginTop: "0.25rem" }}>
              HNS IT Center tidak bertanggung jawab atas kerusakan atau kehilangan yang terjadi selama proses pengiriman melalui kurir pihak ketiga. Risiko pengiriman ditanggung sepenuhnya oleh pelanggan.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
