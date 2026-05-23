"use client";

import { useState, useTransition } from "react";
import { createTicketAction } from "@/app/actions/tickets";
import { AlertCircle, ChevronLeft, ChevronRight, Check } from "lucide-react";
import toast from "react-hot-toast";

type Props = {
  storeLocations: { id: string; name: string; code: string }[];
  technicians: { id: string; name: string }[];
  sales: { id: string; name: string }[];
  upgrades: { id: string; name: string }[];
};

const STEPS = ["Store & Assign", "Customer", "Category", "Details", "Confirm"];

const TICKET_TYPES = [
  { value: "service", label: "Service Request", desc: "Device repair or troubleshooting" },
  { value: "warranty_claim", label: "Warranty Claim", desc: "Claim under purchase warranty" },
  { value: "cleaning", label: "Cleaning Service", desc: "Deep clean or thermal paste" },
  { value: "upgrade", label: "Hardware Upgrade", desc: "RAM, storage, or components" },
  { value: "pc_build", label: "PC Build", desc: "Custom PC assembly" },
];

export default function CreateTicketForm({ storeLocations, technicians, sales, upgrades }: Props) {
  const [step, setStep] = useState(1);
  const [isPending, startTransition] = useTransition();

  // Step 1: Store & Assignment
  const [storeLocationId, setStoreLocationId] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [salesId, setSalesId] = useState("");

  // Step 2: Customer Info
  const [customerType, setCustomerType] = useState("User");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");

  // Step 3: Category
  const [ticketType, setTicketType] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [pickupMethod, setPickupMethod] = useState("self_pickup");

  // Step 4: Details
  const [accessories, setAccessories] = useState("");
  const [deviceCondition, setDeviceCondition] = useState("");
  const [notes, setNotes] = useState("");
  const [isOvernight, setIsOvernight] = useState(false);
  
  // Dynamic details based on ticketType
  const [purchaseDate, setPurchaseDate] = useState("");
  const [cleaningPackage, setCleaningPackage] = useState("");
  const [selectedUpgrades, setSelectedUpgrades] = useState<string[]>([]);
  const [components, setComponents] = useState<string[]>([]);
  const [newComponent, setNewComponent] = useState("");

  // Attachments
  const [ticketFiles, setTicketFiles] = useState<File[]>([]);
  const [progressFiles, setProgressFiles] = useState<File[]>([]);

  // Step 5: Confirm
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateStep = () => {
    const errs: Record<string, string> = {};
    if (step === 1) {
      if (!storeLocationId) errs.storeLocationId = "Please select a store location.";
    }
    if (step === 2) {
      if (!customerName.trim()) errs.customerName = "Customer name is required.";
      if (!phone.match(/^\d{9,13}$/)) errs.phone = "Enter valid phone number digits (9-13 digits).";
    }
    if (step === 3) {
      if (!ticketType) errs.ticketType = "Ticket type is required.";
      if (!deviceType) errs.deviceType = "Device type is required.";
    }
    if (step === 4) {
      if (!notes.trim() && ticketType !== "pc_build" && ticketType !== "upgrade") errs.notes = "Please describe the job or problem.";
      if (ticketType === "warranty_claim" && !purchaseDate) errs.purchaseDate = "Purchase date is required.";
      if (ticketType === "cleaning" && !cleaningPackage) errs.cleaningPackage = "Please select a cleaning package.";
      if (ticketType === "upgrade" && selectedUpgrades.length === 0) errs.selectedUpgrades = "Please select at least one upgrade.";
      if (ticketType === "pc_build" && components.length === 0) errs.components = "Please add at least one component.";
    }
    if (step === 5) {
      if (!termsAccepted) errs.termsAccepted = "You must confirm the details.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => { if (validateStep()) setStep(s => s + 1); };
  const back = () => setStep(s => s - 1);

  const submit = () => {
    if (!validateStep()) return;

    startTransition(async () => {
      const fd = new FormData();
      fd.append("store_location_id", storeLocationId);
      if (technicianId) fd.append("technician_id", technicianId);
      if (salesId) fd.append("sales_id", salesId);

      fd.append("customer_type", customerType);
      fd.append("customer_name", customerName);
      fd.append("phone", `+62${phone}`);

      fd.append("ticket_type", ticketType);
      fd.append("device_type", deviceType);
      fd.append("pickup_method", pickupMethod);

      if (accessories) fd.append("accessories", accessories);
      if (deviceCondition) fd.append("device_condition", deviceCondition);
      if (notes) fd.append("notes", notes);
      if (isOvernight) fd.append("is_overnight_check", "1");

      if (ticketType === "warranty_claim" && purchaseDate) fd.append("purchase_date", purchaseDate);
      if (ticketType === "cleaning" && cleaningPackage) fd.append("service_package", cleaningPackage);
      if (ticketType === "upgrade") {
        selectedUpgrades.forEach(id => fd.append("upgrade_ids", id));
      }
      if (ticketType === "pc_build") {
        fd.append("components", JSON.stringify(components));
      }
      
      ticketFiles.forEach(f => fd.append("ticket_files", f));
      progressFiles.forEach(f => fd.append("progress_files", f));
      
      fd.append("is_for_self", "0"); // Technicians always make tickets on behalf of customers

      const result = await createTicketAction(fd);
      if (result?.error) {
        toast.error(result.error);
        setErrors({ submit: result.error });
      }
    });
  };

  const addComponent = () => {
    if (newComponent.trim()) {
      setComponents([...components, newComponent.trim()]);
      setNewComponent("");
    }
  };

  const toggleUpgrade = (id: string) => {
    setSelectedUpgrades(prev => prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]);
  };

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto" }}>
      {/* Progress Steps */}
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
                  {done ? <Check size={16} /> : num}
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
        {errors.submit && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", padding: "1rem", borderRadius: "8px", color: "#991b1b", display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem" }}>
            <AlertCircle size={16} /> {errors.submit}
          </div>
        )}

        {/* Step 1: Store & Assignment */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>Store & Assignment</h2>
            <div className="form-group">
              <label className="form-label">Store Location *</label>
              <select className={`form-input ${errors.storeLocationId ? "error" : ""}`} value={storeLocationId} onChange={e => setStoreLocationId(e.target.value)}>
                <option value="">Select Store</option>
                {storeLocations.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
              </select>
              {errors.storeLocationId && <span className="form-error"><AlertCircle size={12} />{errors.storeLocationId}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Assign Technician</label>
              <select className="form-input" value={technicianId} onChange={e => setTechnicianId(e.target.value)}>
                <option value="">(Assign Later)</option>
                {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Assign Sales</label>
              <select className="form-input" value={salesId} onChange={e => setSalesId(e.target.value)}>
                <option value="">(Assign Later)</option>
                {sales.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Step 2: Customer Info */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>Customer Information</h2>
            <div className="form-group">
              <label className="form-label">Customer Type</label>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {["User", "Internet_Cafe", "Company", "Dealer"].map(t => (
                  <label key={t} style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                    <input type="radio" checked={customerType === t} onChange={() => setCustomerType(t)} />
                    {t.replace("_", " ")}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Customer Name *</label>
              <input className={`form-input ${errors.customerName ? "error" : ""}`} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="John Doe" />
              {errors.customerName && <span className="form-error"><AlertCircle size={12} />{errors.customerName}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Phone Number *</label>
              <div style={{ display: "flex", alignItems: "center", gap: "0" }}>
                <span style={{ padding: "0.625rem 0.75rem", background: "var(--cream-dark)", border: "1.5px solid var(--border)", borderRight: "none", borderRadius: "var(--radius-md) 0 0 var(--radius-md)", fontSize: "0.9375rem", color: "var(--text-secondary)", fontWeight: 600, flexShrink: 0, lineHeight: "1.5" }}>+62</span>
                <input
                  className={`form-input ${errors.phone ? "error" : ""}`}
                  style={{ borderLeft: "none", borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, ""))}
                  placeholder="8123456789"
                />
              </div>
              {errors.phone && <span className="form-error"><AlertCircle size={12} />{errors.phone}</span>}
            </div>
          </div>
        )}

        {/* Step 3: Category */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>Device & Category</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
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
                <select className={`form-input ${errors.deviceType ? "error" : ""}`} value={deviceType} onChange={e => setDeviceType(e.target.value)}>
                  <option value="">Select Device</option>
                  <option value="PC_Office">PC Office</option>
                  <option value="PC_Gaming">PC Gaming</option>
                  <option value="Laptop_Office">Laptop Office</option>
                  <option value="Laptop_Gaming">Laptop Gaming</option>
                </select>
                {errors.deviceType && <span className="form-error"><AlertCircle size={12} />{errors.deviceType}</span>}
              </div>
            </div>
            <div className="form-group" style={{ marginTop: "1rem" }}>
              <label className="form-label">Pickup Method *</label>
              <select className="form-input" value={pickupMethod} onChange={e => setPickupMethod(e.target.value)}>
                <option value="self_pickup">Self Pickup</option>
                <option value="courier">Courier / Delivery</option>
              </select>
            </div>
          </div>
        )}

        {/* Step 4: Details */}
        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>Details & Notes</h2>
            
            <div className="form-group">
              <label className="form-label">Accessories Included</label>
              <input className="form-input" value={accessories} onChange={e => setAccessories(e.target.value)} placeholder="e.g. Charger, Bag" />
            </div>
            
            <div className="form-group">
              <label className="form-label">Device Condition</label>
              <input className="form-input" value={deviceCondition} onChange={e => setDeviceCondition(e.target.value)} placeholder="Physical condition upon receipt" />
            </div>

            <div className="form-group">
              <label className="form-label">Problem Description / Notes *</label>
              <textarea className={`form-input ${errors.notes ? "error" : ""}`} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Provide details of the job..." />
              {errors.notes && <span className="form-error"><AlertCircle size={12} />{errors.notes}</span>}
            </div>

            {/* Dynamic Fields */}
            {ticketType === "warranty_claim" && (
              <div className="form-group">
                <label className="form-label">Purchase Date *</label>
                <input type="date" className={`form-input ${errors.purchaseDate ? "error" : ""}`} value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
                {errors.purchaseDate && <span className="form-error"><AlertCircle size={12} />{errors.purchaseDate}</span>}
              </div>
            )}

            {ticketType === "cleaning" && (
              <div className="form-group">
                <label className="form-label">Cleaning Package *</label>
                <select className={`form-input ${errors.cleaningPackage ? "error" : ""}`} value={cleaningPackage} onChange={e => setCleaningPackage(e.target.value)}>
                  <option value="">Select Package</option>
                  <option value="Basic_Clean">Basic Clean</option>
                  <option value="Deep_Clean">Deep Clean</option>
                  <option value="Thermal_Paste_Replacement">Thermal Paste Replacement</option>
                </select>
                {errors.cleaningPackage && <span className="form-error"><AlertCircle size={12} />{errors.cleaningPackage}</span>}
              </div>
            )}

            {ticketType === "upgrade" && (
              <div className="form-group">
                <label className="form-label">Select Upgrades *</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {upgrades.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleUpgrade(u.id)}
                      style={{
                        padding: "0.4rem 0.8rem",
                        borderRadius: "20px",
                        border: `1.5px solid ${selectedUpgrades.includes(u.id) ? "var(--primary)" : "var(--border)"}`,
                        background: selectedUpgrades.includes(u.id) ? "var(--primary)" : "var(--white)",
                        color: selectedUpgrades.includes(u.id) ? "var(--white)" : "var(--text-secondary)",
                        fontSize: "0.85rem", cursor: "pointer", transition: "all 0.2s"
                      }}
                    >
                      {u.name}
                    </button>
                  ))}
                </div>
                {errors.selectedUpgrades && <span className="form-error"><AlertCircle size={12} />{errors.selectedUpgrades}</span>}
              </div>
            )}

            {ticketType === "pc_build" && (
              <div className="form-group">
                <label className="form-label">PC Components *</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    className="form-input"
                    value={newComponent}
                    onChange={e => setNewComponent(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addComponent(); } }}
                    placeholder="e.g. RTX 4090, i9-14900K"
                  />
                  <button type="button" onClick={addComponent} className="btn btn-outline">Add</button>
                </div>
                {components.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem" }}>
                    {components.map((c, i) => (
                      <span key={i} style={{ background: "var(--cream-dark)", padding: "0.25rem 0.75rem", borderRadius: "4px", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {c}
                        <button type="button" onClick={() => setComponents(components.filter((_, idx) => idx !== i))} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--accent)" }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                {errors.components && <span className="form-error"><AlertCircle size={12} />{errors.components}</span>}
              </div>
            )}

            <div className="form-group" style={{ marginTop: "1rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", background: "var(--cream)", padding: "1rem", borderRadius: "8px", border: "1px solid var(--border)" }}>
                <input type="checkbox" checked={isOvernight} onChange={e => setIsOvernight(e.target.checked)} style={{ width: "1.25rem", height: "1.25rem" }} />
                <div>
                  <strong style={{ display: "block" }}>Device will stay overnight (Check and Diagnosis)</strong>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Applies a checking fee of Rp. 50,000</span>
                </div>
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginTop: "1rem" }}>
              <div className="form-group">
                <label className="form-label">Ticket Attachments</label>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>Photos of device condition before service.</p>
                <div style={{ background: "var(--bg)", border: "1px dashed var(--border)", borderRadius: "8px", padding: "1rem" }}>
                  <input type="file" multiple onChange={e => setTicketFiles(Array.from(e.target.files || []))} className="form-input" style={{ border: "none", padding: 0 }} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Progress Attachments</label>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>Photos of work already done (if any).</p>
                <div style={{ background: "var(--bg)", border: "1px dashed var(--border)", borderRadius: "8px", padding: "1rem" }}>
                  <input type="file" multiple onChange={e => setProgressFiles(Array.from(e.target.files || []))} className="form-input" style={{ border: "none", padding: 0 }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Confirm */}
        {step === 5 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>Confirm Ticket Details</h2>
            <div style={{ background: "var(--cream)", padding: "1.5rem", borderRadius: "12px", fontSize: "0.9rem" }}>
              <p style={{ marginBottom: "0.5rem" }}><strong>Store:</strong> {storeLocations.find(s => s.id === storeLocationId)?.name}</p>
              <p style={{ marginBottom: "0.5rem" }}><strong>Customer:</strong> {customerName} ({customerType}) - +62{phone}</p>
              <p style={{ marginBottom: "0.5rem" }}><strong>Type:</strong> {ticketType.replace(/_/g, " ")} | {deviceType.replace(/_/g, " ")}</p>
              {notes && <p style={{ marginBottom: "0.5rem" }}><strong>Notes:</strong> {notes}</p>}
              {accessories && <p style={{ marginBottom: "0.5rem" }}><strong>Accessories:</strong> {accessories}</p>}
            </div>
            
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", marginTop: "1rem" }}>
              <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} style={{ width: "1.25rem", height: "1.25rem" }} />
              <span style={{ fontWeight: 500 }}>I confirm the details above are accurate.</span>
            </label>
            {errors.termsAccepted && <span className="form-error"><AlertCircle size={12} />{errors.termsAccepted}</span>}
          </div>
        )}

        {/* Navigation Buttons */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.75rem", gap: "0.75rem" }}>
          {step > 1 ? (
            <button type="button" onClick={back} className="btn btn-secondary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }} disabled={isPending}>
              <ChevronLeft size={16} /> Back
            </button>
          ) : <div />}
          
          {step < STEPS.length ? (
            <button type="button" onClick={next} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="btn btn-primary"
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              {isPending ? "Creating..." : "Create Ticket"} <Check size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
