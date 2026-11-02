"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import { Share2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // The dialog mounts its content through a portal, possibly a render after
  // `open` flips; a callback ref tells the drawing effect when the canvas is
  // really there, instead of reading a ref that may still be empty.
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const attachCanvas = useCallback((el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    setCanvasEl(el);
  }, []);
  const title = monthLabel === "All Time" ? "Technician of the Year" : "Technician of the Month";

  useEffect(() => {
    // canvasEl only says the canvas has mounted; drawing goes through the ref.
    const canvas = canvasRef.current;
    if (open && canvasEl && canvas) {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Card Dimensions (9:16)
      const w = 1080;
      const h = 1920;
      canvas.width = w;
      canvas.height = h;

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
  }, [open, canvasEl, topTechnician, monthLabel, title]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `Top-Technician-${monthLabel.replace(/\s+/g, "-")}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="bg-amber-600 text-white hover:bg-amber-600/90" />}>
        <Share2 aria-hidden="true" />
        Share Winner
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto text-center sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Share Performance Card</DialogTitle>
          <DialogDescription>Ready to share on Instagram/Tiktok Stories (9:16)</DialogDescription>
        </DialogHeader>

        <div className="relative mx-auto aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-xl border-2 border-border bg-muted sm:max-w-none">
          <canvas ref={attachCanvas} className="block size-full" />
        </div>

        <Button onClick={handleDownload} className="w-full">
          <Download aria-hidden="true" />
          Download Image
        </Button>
      </DialogContent>
    </Dialog>
  );
}
