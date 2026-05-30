"use client";

import { useState, useTransition } from "react";
import { updatePickupMethodAction } from "@/app/actions/tickets";
import toast from "react-hot-toast";

interface PickupMethodSelectorProps {
  ticketId: string;
  initialMethod: string;
}

export default function PickupMethodSelector({ ticketId, initialMethod }: PickupMethodSelectorProps) {
  const [method, setMethod] = useState(initialMethod);
  const [isPending, startTransition] = useTransition();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMethod = e.target.value as "self_pickup" | "courier";
    setMethod(newMethod);

    startTransition(async () => {
      const res = await updatePickupMethodAction(ticketId, newMethod);
      if (res?.error) {
        toast.error(res.error);
        setMethod(initialMethod);
      } else {
        toast.success("Pickup method updated successfully!");
      }
    });
  };

  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">Handle</p>
      <select
        value={method}
        onChange={handleChange}
        disabled={isPending}
        className="form-input !py-1 !px-2 !text-sm"
        style={{ cursor: isPending ? "not-allowed" : "pointer" }}
      >
        <option value="self_pickup">Self Pickup</option>
        <option value="courier">Courier</option>
      </select>
    </div>
  );
}
