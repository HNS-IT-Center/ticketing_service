"use client";

import { useState, useTransition } from "react";
import { createTicketAction } from "@/app/actions/tickets";
import dynamic from "next/dynamic";
import TagInput from "@/components/ui/TagInput";
import FileUpload from "@/components/ui/FileUpload";
import { AlertCircle, ChevronRight, ChevronLeft } from "lucide-react";
import toast from "react-hot-toast";

const RichTextEditor = dynamic(() => import("@/components/ui/RichTextEditor"), { ssr: false });

interface CreateTicketFormProps {
  upgrades: { id: string; name: string; points: number }[];
  technicians: { id: string; name: string }[];
  sales: { id: string; name: string }[];
}

const TICKET_TYPES = [
  { value: "service", label: "Service Request", desc: "Device repair or troubleshooting" },
  { value: "warranty_claim", label: "Warranty Claim", desc: "Claim under purchase warranty" },
  { value: "cleaning", label: "Cleaning Service", desc: "Deep clean or thermal paste" },
  { value: "upgrade", label: "Hardware Upgrade", desc: "RAM, storage, or components" },
  { value: "pc_build", label: "PC Build", desc: "Custom PC assembly" },
];

const DEVICE_TYPES = ["PC_Office", "PC_Gaming", "Laptop_Office", "Laptop_Gaming"];

export default function CreateTicketForm({ upgrades, technicians, sales }: CreateTicketFormProps) {
  const [step, setStep] = useState(1);
  const [isPending, startTransition] = useTransition();

  // Step 1 — Personal info
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(""); // stores digits only after +62
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  // Step 2 — Category
  const [ticketType, setTicketType] = useState("");
  const [deviceType, setDeviceType] = useState("");

  // Step 3 — Category-specific
  const [notes, setNotes] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [cleaningPackage, setCleaningPackage] = useState("");
  const [selectedUpgrades, setSelectedUpgrades] = useState<string[]>([]);
  const [components, setComponents] = useState<string[]>([]);
  const [selectedTechnician, setSelectedTechnician] = useState("");
  const [selectedSales, setSelectedSales] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  // Step 4 — Confirm
  const [checkCorrect, setCheckCorrect] = useState(false);
  const [checkPromo, setCheckPromo] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateStep = () => {
    const errs: Record<string, string> = {};
    if (step === 1) {
      if (!name.trim()) errs.name = "Name is required";
      if (!phone.match(/^\d{9,13}$/)) errs.phone = "Enter digits after +62 (9–13 digits)";
      if (!email.includes("@")) errs.email = "Valid email required";
      if (!address.trim()) errs.address = "Address is required";
    }
    if (step === 2) {
      if (!ticketType) errs.ticketType = "Please select a ticket type";
      if (!deviceType) errs.deviceType = "Please select a device type";
    }
    if (step === 3) {
      if ((ticketType === "service" || ticketType === "warranty_claim") && !notes) {
        errs.notes = "Problem description is required";
      }
      if (ticketType === "warranty_claim" && !purchaseDate) {
        errs.purchaseDate = "Purchase date is required";
      }
      if (ticketType === "cleaning" && !cleaningPackage) {
        errs.cleaningPackage = "Select a service package";
      }
      if (ticketType === "upgrade" && selectedUpgrades.length === 0) {
        errs.upgrades = "Select at least one upgrade";
      }
      if (ticketType === "pc_build" && components.length === 0) {
        errs.components = "Add at least one component";
      }
    }
    if (step === 4) {
      if (!checkCorrect) errs.checkCorrect = "Please confirm data correctness";
      if (!checkPromo) errs.checkPromo = "Please agree to the terms";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => { if (validateStep()) setStep((s) => s + 1); };
  const back = () => setStep((s) => s - 1);

  const submit = () => {
    if (!validateStep()) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("ticket_type", ticketType);
      fd.append("device_type", deviceType);
      fd.append("notes", notes);
      if (purchaseDate) fd.append("purchase_date", purchaseDate);
      if (cleaningPackage) fd.append("service_package", cleaningPackage);
      selectedUpgrades.forEach((id) => fd.append("upgrade_ids", id));
      if (ticketType === "pc_build") fd.append("components", JSON.stringify(components));
      if (selectedTechnician) fd.append("technician_id", selectedTechnician);
      if (selectedSales) fd.append("sales_id", selectedSales);
      fd.append("phone", `+62${phone}`); // prepend +62 prefix

      const result = await createTicketAction(fd);
      if (result?.error) toast.error(result.error);
    });
  };

  const STEPS = ["Personal Info", "Category", "Details", "Confirm"];

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto" }}>
      {/* Progress */}
      <div style={{ display: "flex", gap: "0", marginBottom: "2rem" }}>
        {STEPS.map((label, i) => {
          const num = i + 1;
          const done = step > num;
          const active = step === num;
          return (
            <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.375rem" }}>
              <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                {i > 0 && <div style={{ flex: 1, height: "2px", background: done ? "var(--primary)" : "var(--border)" }} />}
                <div style={{
                  width: "2rem", height: "2rem", borderRadius: "50%", flexShrink: 0,
                  background: done || active ? "var(--primary)" : "var(--border)",
                  color: done || active ? "#fff" : "var(--text-muted)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.875rem", fontWeight: 700, transition: "all 0.2s",
                }}>
                  {done ? "✓" : num}
                </div>
                {i < STEPS.length - 1 && <div style={{ flex: 1, height: "2px", background: done ? "var(--primary)" : "var(--border)" }} />}
              </div>
              <span style={{ fontSize: "0.75rem", color: active ? "var(--primary)" : "var(--text-muted)", fontWeight: active ? 600 : 400, whiteSpace: "nowrap" }}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ padding: "2rem" }}>
        {/* Step 1: Personal Info */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>Personal Information</h2>
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input className={`form-input ${errors.name ? "error" : ""}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" />
              {errors.name && <span className="form-error"><AlertCircle size={12} />{errors.name}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Phone Number *</label>
              <div style={{ display: "flex", alignItems: "center", gap: "0" }}>
                <span style={{
                  padding: "0.625rem 0.75rem",
                  background: "var(--cream-dark)",
                  border: "1.5px solid var(--border)",
                  borderRight: "none",
                  borderRadius: "var(--radius-md) 0 0 var(--radius-md)",
                  fontSize: "0.9375rem",
                  color: "var(--text-secondary)",
                  fontWeight: 600,
                  flexShrink: 0,
                  lineHeight: "1.5",
                }}>+62</span>
                <input
                  className={`form-input ${errors.phone ? "error" : ""}`}
                  value={phone}
                  onChange={(e) => {
                    // Only allow digits
                    setPhone(e.target.value.replace(/\D/g, ""));
                  }}
                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  inputMode="numeric"
                  placeholder="81234567890"
                  style={{ borderRadius: "0 var(--radius-md) var(--radius-md) 0" }}
                />
              </div>
              {errors.phone && <span className="form-error"><AlertCircle size={12} />{errors.phone}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Email *</label>
              <input className={`form-input ${errors.email ? "error" : ""}`} value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" />
              {errors.email && <span className="form-error"><AlertCircle size={12} />{errors.email}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Address *</label>
              <textarea className={`form-input ${errors.address ? "error" : ""}`} value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Your full address" />
              {errors.address && <span className="form-error"><AlertCircle size={12} />{errors.address}</span>}
            </div>
          </div>
        )}

        {/* Step 2: Category */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <h2 style={{ marginBottom: "0.25rem" }}>Select Category</h2>
            <div>
              <p className="form-label" style={{ marginBottom: "0.75rem" }}>Ticket Type *</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {TICKET_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTicketType(t.value)}
                    style={{
                      padding: "0.875rem 1rem",
                      border: `2px solid ${ticketType === t.value ? "var(--primary)" : "var(--border)"}`,
                      borderRadius: "var(--radius-md)",
                      background: ticketType === t.value ? "rgba(22,70,157,0.06)" : "var(--white)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.2s",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                    }}
                  >
                    <div style={{
                      width: "1.25rem", height: "1.25rem", borderRadius: "50%",
                      border: `2px solid ${ticketType === t.value ? "var(--primary)" : "var(--border)"}`,
                      background: ticketType === t.value ? "var(--primary)" : "transparent",
                      flexShrink: 0,
                    }} />
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{t.label}</div>
                      <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>{t.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
              {errors.ticketType && <span className="form-error" style={{ marginTop: "0.5rem" }}><AlertCircle size={12} />{errors.ticketType}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Device Type *</label>
              <select className={`form-input ${errors.deviceType ? "error" : ""}`} value={deviceType} onChange={(e) => setDeviceType(e.target.value)}>
                <option value="">Select device...</option>
                {DEVICE_TYPES.map((d) => (
                  <option key={d} value={d}>{d.replace(/_/g, " ")}</option>
                ))}
              </select>
              {errors.deviceType && <span className="form-error"><AlertCircle size={12} />{errors.deviceType}</span>}
            </div>
          </div>
        )}

        {/* Step 3: Details */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <h2 style={{ marginBottom: "0.25rem" }}>
              {TICKET_TYPES.find((t) => t.value === ticketType)?.label} Details
            </h2>

            {/* Service / Warranty */}
            {(ticketType === "service" || ticketType === "warranty_claim") && (
              <>
                {ticketType === "warranty_claim" && (
                  <div className="form-group">
                    <label className="form-label">Purchase Date *</label>
                    <input type="date" className={`form-input ${errors.purchaseDate ? "error" : ""}`} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
                    {errors.purchaseDate && <span className="form-error"><AlertCircle size={12} />{errors.purchaseDate}</span>}
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Problem Description *</label>
                  <RichTextEditor value={notes} onChange={setNotes} placeholder="Describe the issue in detail..." />
                  {errors.notes && <span className="form-error"><AlertCircle size={12} />{errors.notes}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">Attachments</label>
                  <FileUpload onChange={setFiles} />
                </div>
              </>
            )}

            {/* Cleaning */}
            {ticketType === "cleaning" && (
              <div className="form-group">
                <label className="form-label">Service Package *</label>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  {["Deep_Clean", "Repaste"].map((pkg) => (
                    <button
                      key={pkg}
                      type="button"
                      onClick={() => setCleaningPackage(pkg)}
                      className="btn"
                      style={{
                        flex: 1,
                        background: cleaningPackage === pkg ? "var(--primary)" : "var(--white)",
                        color: cleaningPackage === pkg ? "#fff" : "var(--text-primary)",
                        border: `2px solid ${cleaningPackage === pkg ? "var(--primary)" : "var(--border)"}`,
                        padding: "0.875rem",
                      }}
                    >
                      {pkg.replace("_", " ")}
                    </button>
                  ))}
                </div>
                {errors.cleaningPackage && <span className="form-error"><AlertCircle size={12} />{errors.cleaningPackage}</span>}
              </div>
            )}

            {/* Upgrade */}
            {ticketType === "upgrade" && (
              <div className="form-group">
                <label className="form-label">Select Upgrades *</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {upgrades.map((u) => (
                    <label key={u.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", border: `1.5px solid ${selectedUpgrades.includes(u.id) ? "var(--primary)" : "var(--border)"}`, borderRadius: "var(--radius-md)", cursor: "pointer", background: selectedUpgrades.includes(u.id) ? "rgba(22,70,157,0.05)" : "var(--white)" }}>
                      <input
                        type="checkbox"
                        checked={selectedUpgrades.includes(u.id)}
                        onChange={(e) => setSelectedUpgrades(e.target.checked ? [...selectedUpgrades, u.id] : selectedUpgrades.filter((id) => id !== u.id))}
                      />
                      <span style={{ fontWeight: 500 }}>{u.name}</span>
                      {/* Points intentionally hidden from customer view */}
                    </label>
                  ))}
                </div>
                {errors.upgrades && <span className="form-error"><AlertCircle size={12} />{errors.upgrades}</span>}
              </div>
            )}

            {/* PC Build */}
            {ticketType === "pc_build" && (
              <>
                <div className="form-group">
                  <label className="form-label">Components *</label>
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                    Type component name and press Enter (e.g. "i5 12400F")
                  </p>
                  <TagInput value={components} onChange={setComponents} placeholder="Add component and press Enter..." />
                  {errors.components && <span className="form-error"><AlertCircle size={12} />{errors.components}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">Preferred Sales (optional)</label>
                  <select className="form-input" value={selectedSales} onChange={(e) => setSelectedSales(e.target.value)}>
                    <option value="">No preference</option>
                    {sales.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Preferred Technician (optional)</label>
                  <select className="form-input" value={selectedTechnician} onChange={(e) => setSelectedTechnician(e.target.value)}>
                    <option value="">Auto-assign</option>
                    {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <h2 style={{ marginBottom: "0.25rem" }}>Confirm Submission</h2>

            {/* Summary */}
            <div style={{ background: "var(--cream)", borderRadius: "var(--radius-md)", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {[
                ["Ticket Type", TICKET_TYPES.find((t) => t.value === ticketType)?.label],
                ["Device", deviceType.replace(/_/g, " ")],
                ["Name", name],
                ["Phone", phone],
                ["Email", email],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem" }}>
                  <span style={{ color: "var(--text-muted)" }}>{label}</span>
                  <span style={{ fontWeight: 500 }}>{value}</span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <label style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", cursor: "pointer" }}>
                <input type="checkbox" checked={checkCorrect} onChange={(e) => setCheckCorrect(e.target.checked)} style={{ marginTop: "0.2rem" }} />
                <span style={{ fontSize: "0.9rem" }}>
                  I confirm that all information provided above is accurate and complete.
                </span>
              </label>
              {errors.checkCorrect && <span className="form-error"><AlertCircle size={12} />{errors.checkCorrect}</span>}

              <label style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", cursor: "pointer" }}>
                <input type="checkbox" checked={checkPromo} onChange={(e) => setCheckPromo(e.target.checked)} style={{ marginTop: "0.2rem" }} />
                <span style={{ fontSize: "0.9rem" }}>
                  I agree that my data may be used for promotional and service improvement purposes.
                </span>
              </label>
              {errors.checkPromo && <span className="form-error"><AlertCircle size={12} />{errors.checkPromo}</span>}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.75rem", gap: "0.75rem" }}>
          {step > 1 ? (
            <button type="button" onClick={back} className="btn btn-secondary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <ChevronLeft size={16} /> Back
            </button>
          ) : <div />}

          {step < 4 ? (
            <button type="button" onClick={next} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="btn btn-primary"
            >
              {isPending ? <><span className="spinner spinner-sm" />Submitting...</> : "Submit Ticket"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
