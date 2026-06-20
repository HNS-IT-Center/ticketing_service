"use client";

import { useState, useTransition, useOptimistic } from "react";
import { toggleExtraServiceAction } from "@/app/actions/tickets";
import toast from "react-hot-toast";
import { Sparkles, CheckCircle2, Circle } from "lucide-react";

/** Predefined extra services a technician can add to any ticket type */
const EXTRA_SERVICES = [
  { key: "repaste", label: "Thermal Repaste", emoji: "🌡️", desc: "CPU/GPU repaste with quality compound" },
  { key: "deep_clean", label: "Deep Cleaning", emoji: "🧹", desc: "Full internal component cleaning" },
  { key: "os_reinstall", label: "OS Reinstallation", emoji: "💿", desc: "Fresh OS install with drivers" },
  { key: "data_backup", label: "Data Backup", emoji: "💾", desc: "Full data backup before work" },
  { key: "stress_test", label: "Stress Test", emoji: "🔬", desc: "Burn-in test after repair" },
  { key: "cable_management", label: "Cable Management", emoji: "🔌", desc: "Neat cable routing & tidy-up" },
];

const BONUS_PTS = 3;

interface ExtraPointsPanelProps {
  ticketId: string;
  initialServices: string[];
  /** Base ticket points (without extra services) */
  basePoints: number;
}

export default function ExtraPointsPanel({ ticketId, initialServices, basePoints }: ExtraPointsPanelProps) {
  const [services, setServices] = useState<string[]>(initialServices);
  const [isPending, startTransition] = useTransition();

  const totalPoints = basePoints + services.length * BONUS_PTS;

  const toggle = (key: string) => {
    const isAdding = !services.includes(key);
    const next = isAdding
      ? [...services, key]
      : services.filter((s) => s !== key);
    // Optimistic update
    setServices(next);

    startTransition(async () => {
      const res = await toggleExtraServiceAction(ticketId, key, isAdding);
      if (res?.error) {
        toast.error(res.error);
        setServices(services); // revert
      } else {
        toast.success(
          isAdding
            ? `Added "${EXTRA_SERVICES.find((s) => s.key === key)?.label}" +${BONUS_PTS} pts`
            : `Removed "${EXTRA_SERVICES.find((s) => s.key === key)?.label}"`
        );
      }
    });
  };

  return (
    <div className="card" style={{ padding: "1.25rem 1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Sparkles size={16} style={{ color: "#f59e0b" }} />
          <h3 style={{ margin: 0, fontSize: "0.9375rem" }}>Additional Services</h3>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: "0.4rem",
          padding: "0.25rem 0.75rem", borderRadius: "999px",
          background: services.length > 0 ? "rgba(234,179,8,0.12)" : "rgba(107,114,128,0.08)",
          border: `1px solid ${services.length > 0 ? "rgba(234,179,8,0.3)" : "rgba(107,114,128,0.15)"}`,
          fontSize: "0.8125rem", fontWeight: 700,
          color: services.length > 0 ? "#92400e" : "var(--text-muted)",
        }}>
          <Sparkles size={11} />
          {totalPoints} pts total
          {services.length > 0 && (
            <span style={{ fontWeight: 400, opacity: 0.7, fontSize: "0.72rem" }}>
              ({basePoints} + {services.length * BONUS_PTS})
            </span>
          )}
        </div>
      </div>

      <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "0.875rem", lineHeight: 1.5 }}>
        Check any additional services performed — each adds <strong style={{ color: "#92400e" }}>+{BONUS_PTS} pts</strong> to this ticket.
      </p>

      {/* Service Checkboxes */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {EXTRA_SERVICES.map((svc) => {
          const checked = services.includes(svc.key);
          return (
            <button
              key={svc.key}
              type="button"
              onClick={() => toggle(svc.key)}
              disabled={isPending}
              style={{
                display: "flex", alignItems: "center", gap: "0.75rem",
                padding: "0.625rem 0.875rem",
                border: `1.5px solid ${checked ? "rgba(234,179,8,0.4)" : "var(--border-light)"}`,
                borderRadius: "var(--radius-md)",
                background: checked ? "rgba(234,179,8,0.07)" : "var(--cream)",
                cursor: isPending ? "not-allowed" : "pointer",
                opacity: isPending ? 0.7 : 1,
                textAlign: "left",
                transition: "all 0.15s ease",
                width: "100%",
              }}
            >
              {checked
                ? <CheckCircle2 size={16} style={{ color: "#d97706", flexShrink: 0 }} />
                : <Circle size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              }
              <span style={{ fontSize: "0.875rem" }}>{svc.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--text-primary)" }}>
                  {svc.label}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>
                  {svc.desc}
                </div>
              </div>
              <span style={{
                fontSize: "0.75rem", fontWeight: 700,
                color: checked ? "#92400e" : "var(--text-muted)",
                whiteSpace: "nowrap", opacity: checked ? 1 : 0.5,
              }}>
                +{BONUS_PTS} pts
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
