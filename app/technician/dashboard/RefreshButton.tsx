"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <Button variant="outline" onClick={handleRefresh} disabled={isPending} title="Refresh" className="bg-card">
      <RefreshCw aria-hidden="true" className={cn(isPending && "animate-spin")} />
      {isPending ? "Refreshing..." : "Refresh"}
    </Button>
  );
}
