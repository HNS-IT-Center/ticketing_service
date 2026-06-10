"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export default function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <button
      onClick={handleRefresh}
      disabled={isPending}
      title="Refresh"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        padding: "0.3rem 0.7rem",
        borderRadius: "var(--radius-md)",
        border: "1.5px solid var(--border)",
        background: "var(--white)",
        color: "var(--text-secondary)",
        fontSize: "0.8rem",
        fontWeight: 600,
        cursor: isPending ? "not-allowed" : "pointer",
        opacity: isPending ? 0.6 : 1,
        transition: "all 0.15s",
      }}
    >
      <RefreshCw
        size={13}
        style={{
          animation: isPending ? "spin 0.8s linear infinite" : "none",
        }}
      />
      {isPending ? "Refreshing..." : "Refresh"}
    </button>
  );
}
