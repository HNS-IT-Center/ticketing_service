"use client";

import { Link2, Check } from "lucide-react";
import { useState } from "react";

export default function PublicShareButton({ shareToken }: { shareToken: string }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    const url = `${window.location.origin}/ticket/${shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  return (
    <button 
      onClick={copyToClipboard}
      className="btn btn-outline btn-sm"
      style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}
      title="Copy public link"
    >
      {copied ? <Check size={14} /> : <Link2 size={14} />}
      {copied ? "Copied" : "Share"}
    </button>
  );
}
