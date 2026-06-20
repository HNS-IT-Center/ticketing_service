"use client";

import { useState, useTransition } from "react";
import { updatePickupMethodAction } from "@/app/actions/tickets";
import toast from "react-hot-toast";
import { Truck } from "lucide-react";

interface PickupMethodSelectorProps {
  ticketId: string;
  initialMethod: string;
  /** The ticket_type — courier is only available for pc_build tickets */
  ticketType: string;
}

export default function PickupMethodSelector({ ticketId, initialMethod, ticketType }: PickupMethodSelectorProps) {
  const [method, setMethod] = useState(initialMethod);
  const [isPending, startTransition] = useTransition();

  const isCourierAllowed = ticketType === "pc_build";

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMethod = e.target.value as "self_pickup" | "courier";
    if (newMethod === "courier" && !isCourierAllowed) return;
    setMethod(newMethod);

    startTransition(async () => {
      const res = await updatePickupMethodAction(ticketId, newMethod);
      if (res?.error) {
        toast.error(res.error);
        setMethod(initialMethod);
      } else {
        toast.success("Pickup method updated!");
      }
    });
  };

  return (
    <div>
      <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
        <Truck size={12} /> Pickup / Delivery
      </p>
      <select
        value={method}
        onChange={handleChange}
        disabled={isPending}
        className="form-input !py-1 !px-2 !text-sm"
        style={{ cursor: isPending ? "not-allowed" : "pointer" }}
      >
        <option value="self_pickup">Self Pickup</option>
        <option
          value="courier"
          disabled={!isCourierAllowed}
          title={!isCourierAllowed ? "Courier delivery is only available for PC Build tickets" : ""}
        >
          Courier{!isCourierAllowed ? " (PC Build only)" : ""}
        </option>
      </select>
      {!isCourierAllowed && (
        <p className="text-xs text-gray-400 mt-1">
          Courier option is only available for PC Build tickets.
        </p>
      )}
    </div>
  );
}
