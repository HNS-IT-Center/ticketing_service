"use client";

import { useState, useTransition } from "react";
import { updatePickupMethodAction } from "@/app/actions/tickets";
import toast from "react-hot-toast";
import { Truck } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";

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
    <div data-slot="pickup-method" className="flex flex-col gap-1">
      <label htmlFor={`pickup-${ticketId}`} className="flex items-center gap-1 text-xs text-muted-foreground">
        <Truck aria-hidden="true" className="size-3" /> Pickup / Delivery
      </label>
      <NativeSelect
        id={`pickup-${ticketId}`}
        value={method}
        onChange={handleChange}
        disabled={isPending}
      >
        <option value="self_pickup">Self Pickup</option>
        <option
          value="courier"
          disabled={!isCourierAllowed}
          title={!isCourierAllowed ? "Courier delivery is only available for PC Build tickets" : ""}
        >
          Courier{!isCourierAllowed ? " (PC Build only)" : ""}
        </option>
      </NativeSelect>
      {!isCourierAllowed && (
        <p className="text-xs text-muted-foreground">
          Courier option is only available for PC Build tickets.
        </p>
      )}
    </div>
  );
}
