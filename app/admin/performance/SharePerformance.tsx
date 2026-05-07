"use client";

import { useState, useRef, useEffect } from "react";
import { Share2, X, Download } from "lucide-react";

interface Row {
  id: string;
  name: string;
  tickets: number;
  success: number;
  failed: number;
  points: number;
}

export default function SharePerformance({ topTechnician, monthLabel }: { topTechnician: Row, monthLabel: string }) {
  const [open, setOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const title = monthLabel === "All Time" ? "Technician of the Year" : "Technician of the Month";

  useEffect(() => {
    if (open && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;

      // Card Dimensions (9:16)
      const w = 1080;
      const h = 1920;
      canvasRef.current.width = w;
      canvasRef.current.height = h;

      // Background Gradient
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#0f172a");
      grad.addColorStop(1, "#1e3a8a");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Top/Bottom Graphic Patterns
      ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(w / 2, h + 200, 400 + i * 150, 0, Math.PI * 2);
        ctx.fill();
      }

      // Branding
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "600 36px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("HNS IT Center", w / 2, 120);

      // Title
      ctx.fillStyle = "#fbbf24";
      ctx.font = "800 80px 'Inter', sans-serif";
      ctx.fillText(title, w / 2, 350);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "500 48px 'Inter', sans-serif";
      ctx.fillText(monthLabel, w / 2, 420);

      // Crown Emoji
      ctx.font = "180px 'Inter', sans-serif";
      ctx.fillText("👑", w / 2, 700);

      // Name
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 110px 'Inter', sans-serif";
      ctx.fillText(topTechnician.name, w / 2, 880);

      // Stats Box
      const boxW = 800;
      const boxH = 400;
      const boxX = (w - boxW) / 2;
      const boxY = 1050;

      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      ctx.roundRect(boxX, boxY, boxW, boxH, 40);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 4;
      ctx.stroke();

      // Stats inside Box
      const stats = [
        { label: "Tickets Done", value: topTechnician.success },
        { label: "Points Earned", value: topTechnician.points },
        { label: "Successful Rate", value: `${Math.round((topTechnician.success / topTechnician.tickets) * 100 || 0)}%` },
      ];

      stats.forEach((s, i) => {
        const xOffset = boxX + (boxW / 3) * i + (boxW / 6);
        
        ctx.fillStyle = "#f8fafc";
        ctx.font = "800 80px 'Inter', sans-serif";
        ctx.fillText(String(s.value), xOffset, boxY + 180);

        ctx.fillStyle = "#94a3b8";
        ctx.font = "600 32px 'Inter', sans-serif";
        ctx.fillText(s.label, xOffset, boxY + 260);
      });

      // Generation Date
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "400 32px 'Inter', sans-serif";
      ctx.fillText(`Generated on ${new Date().toLocaleDateString("id-ID")}`, w / 2, h - 80);
    }
  }, [open, topTechnician, monthLabel, title]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `Top-Technician-${monthLabel.replace(/\s+/g, "-")}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  return (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)} style={{ background: "#ca8a04", color: "#fff", border: "none" }}>
        <Share2 size={15} />
        Share Winner
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "450px", textAlign: "center" }}>
            <div className="modal-header">
              <h3 className="modal-title">Share Performance Card</h3>
              <button className="modal-close" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
              Ready to share on Instagram/Tiktok Stories (9:16)
            </p>

            <div style={{ 
              width: "100%", 
              aspectRatio: "9/16", 
              background: "var(--bg-light)", 
              borderRadius: "var(--radius-lg)", 
              overflow: "hidden",
              border: "2px solid var(--border)",
              position: "relative"
            }}>
              <canvas 
                ref={canvasRef} 
                style={{ width: "100%", height: "100%", display: "block" }} 
              />
            </div>

            <button className="btn btn-primary" onClick={handleDownload} style={{ width: "100%", marginTop: "1rem" }}>
              <Download size={18} />
              Download Image
            </button>
          </div>
        </div>
      )}
    </>
  );
}
