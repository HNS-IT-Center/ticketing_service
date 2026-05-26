"use client";

import { useState, useEffect } from "react";
import { Share2, Check, Copy } from "lucide-react";

export default function PublicShareButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.share) {
      setCanShare(true);
    }
  }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[0.8125rem] text-gray-500">Bagikan:</span>
      <button
        onClick={copy}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-[0.8125rem] border transition-all cursor-pointer font-inherit ${
          copied ? "bg-green-50 border-green-200 text-green-700" : "bg-gray-50 border-gray-200 text-gray-700"
        }`}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Tersalin!" : "Salin Link"}
      </button>
      {canShare && (
        <button
          onClick={() => navigator.share({ title: "Status Tiket HNS IT Center", url })}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[0.8125rem] bg-indigo-50 border border-indigo-200 text-indigo-600 transition-all cursor-pointer font-inherit"
        >
          <Share2 size={14} /> Bagikan
        </button>
      )}
    </div>
  );
}
