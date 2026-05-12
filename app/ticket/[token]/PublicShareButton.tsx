"use client";

import { useState } from "react";
import { Share2, Check, Copy } from "lucide-react";

export default function PublicShareButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: "0.8125rem", color: "#6b7280" }}>Bagikan:</span>
      <button
        onClick={copy}
        style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          background: copied ? "#f0fdf4" : "#f9fafb",
          border: `1px solid ${copied ? "#bbf7d0" : "#e5e7eb"}`,
          borderRadius: "8px", padding: "0.5rem 0.875rem",
          fontSize: "0.8125rem", color: copied ? "#15803d" : "#374151",
          cursor: "pointer", transition: "all 0.2s", fontFamily: "inherit",
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Tersalin!" : "Salin Link"}
      </button>
      {typeof window !== "undefined" && navigator.share && (
        <button
          onClick={() => navigator.share({ title: "Status Tiket HNS IT Center", url })}
          style={{
            display: "flex", alignItems: "center", gap: "0.5rem",
            background: "#f0f4ff", border: "1px solid #c7d2fe",
            borderRadius: "8px", padding: "0.5rem 0.875rem",
            fontSize: "0.8125rem", color: "#4f46e5",
            cursor: "pointer", transition: "all 0.2s", fontFamily: "inherit",
          }}
        >
          <Share2 size={14} /> Bagikan
        </button>
      )}
    </div>
  );
}
