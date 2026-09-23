"use client";

import { useState, useTransition } from "react";
import { createTicketAction } from "@/app/actions/tickets";
import { AlertCircle, ChevronLeft, ChevronRight, Check, Laptop, Monitor, Printer, Settings, Cpu, HardDrive } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import FileUpload from "@/components/ui/FileUpload";
import TagInput from "@/components/ui/TagInput";

type Props = {
  storeLocations: { id: string; name: string; code: string }[];
  technicians: { id: string; name: string; store_assignments: { store_id: string }[] }[];
  sales: { id: string; name: string }[];
  upgrades: { id: string; name: string }[];
  defaultStoreLocationId?: string;
};

const STEPS = ["Intake & Assign", "Choose Device", "Service Details", "Confirm"];

const DEVICES = [
  { id: "Laptop", icon: Laptop, label: "Laptop" },
  { id: "Computer", icon: Monitor, label: "Computer" },
  { id: "Printer", icon: Printer, label: "Printer" },
  { id: "Others", icon: Settings, label: "Others" },
  { id: "Build PC", icon: Cpu, label: "Build PC" },
];

export default function CreateTicketForm({ storeLocations, technicians, sales, upgrades, defaultStoreLocationId }: Props) {
  const [step, setStep] = useState(1);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Step 1: Intake & Assign
  const [storeLocationId, setStoreLocationId] = useState(defaultStoreLocationId || "");
  const [technicianId, setTechnicianId] = useState("");
  const [salesId, setSalesId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneFocused, setPhoneFocused] = useState(false);

  // Step 2: Choose Device
  const [gridDevice, setGridDevice] = useState("");

  // Step 3: Service Details (Case)
  // No default: the case must be chosen explicitly. Pre-selecting "service"
  // silently produced service tickets whenever someone did not notice the
  // chips, which made warranty claims practically unreachable.
  const [ticketType, setTicketType] = useState("");
  const [deviceType, setDeviceType] = useState(""); // actual Prisma enum: Laptop_Office, PC_Office, etc.
  const [deviceName, setDeviceName] = useState(""); // "Device Type (Optional)" in user terms
  const [deviceSn, setDeviceSn] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [conditions, setConditions] = useState<string[]>([]); // Garansi Aktif, Garansi Habis, Segel Utuh, Fisik Mulus
  const [selectedAccessories, setSelectedAccessories] = useState<string[]>([]);
  const [customAccessory, setCustomAccessory] = useState("");
  const [notes, setNotes] = useState("");
  const [checkDiagnosisFee, setCheckDiagnosisFee] = useState(true); // Default true for Service
  const [cleaningPackage, setCleaningPackage] = useState(""); // Basic_Cleaning, Full_Repaste, Full_Repaste_CPU_GPU
  const [selectedUpgrades, setSelectedUpgrades] = useState<string[]>([]);
  // Step 3 file attachments — stored as R2 temp URLs immediately after upload
  // This avoids keeping File objects in state across step navigation (causes hydration issues)
  const [uploadedFileUrls, setUploadedFileUrls] = useState<string[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [pcComponents, setPcComponents] = useState<string[]>([]);
  
  // Keep overnight/pickup in case needed later, or default
  const [pickupMethod, setPickupMethod] = useState("self_pickup");
  const [isOvernight, setIsOvernight] = useState(false);

  // Step 4: Confirm
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const getAvailableCases = () => {
    // "warranty_claim" opens the claim intake and, later, the handover to RMA.
    // It applies to any physical unit still under warranty; a Build PC is a
    // service we perform, not a unit that gets claimed.
    if (gridDevice === "Laptop" || gridDevice === "Computer")
      return ["service", "cleaning", "upgrade", "warranty_claim"];
    if (gridDevice === "Printer" || gridDevice === "Others")
      return ["service", "cleaning", "warranty_claim"];
    if (gridDevice === "Build PC") return ["pc_build"];
    return [];
  };

  const validateStep = () => {
    const errs: Record<string, string> = {};
    if (step === 1) {
      if (!storeLocationId) errs.storeLocationId = "Please select a store location.";
      if (!customerName.trim()) errs.customerName = "Customer name is required.";
      if (!phone.match(/^\d{9,13}$/)) errs.phone = "Enter valid phone number digits (9-13 digits).";
      if (customerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
        errs.customerEmail = "Please enter a valid email address.";
      }
    }
    if (step === 2) {
      if (!gridDevice) errs.gridDevice = "Please select a device.";
    }
    if (step === 3) {
      if (!ticketType) errs.ticketType = "Please select a case (Service, Cleaning, etc.).";
      if (ticketType === "service" || ticketType === "cleaning") {
        if (!deviceType) errs.deviceType = "Device category specification is required.";
      }
      if (ticketType === "service" && !notes.trim()) errs.notes = "Problem description is required.";
      if (ticketType === "warranty_claim") {
        // The RMA desk verifies the unit against both, so intake must capture them.
        if (!deviceSn.trim()) errs.deviceSn = "SN wajib diisi untuk klaim garansi.";
        if (!purchaseDate) errs.purchaseDate = "Tanggal pembelian wajib diisi untuk klaim garansi.";
        if (!notes.trim()) errs.notes = "Deskripsi keluhan wajib diisi untuk klaim garansi.";
      }
      if (ticketType === "cleaning" && !cleaningPackage) errs.cleaningPackage = "Cleaning package is required.";
      if (ticketType === "upgrade" && selectedUpgrades.length === 0) errs.selectedUpgrades = "Please select at least one upgrade.";
    }
    if (step === 4) {
      if (!termsAccepted) errs.termsAccepted = "You must confirm the details.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => { if (validateStep()) setStep(s => s + 1); };
  const back = () => setStep(s => s - 1);

  const handleFileUpload = async (files: File[]) => {
    setFiles(files);
    if (files.length === 0) {
      setUploadedFileUrls([]);
      return;
    }
    setIsUploadingFiles(true);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append("files", f));
      const res = await fetch("/api/upload-temp", { method: "POST", body: fd });
      const json = await res.json() as { uploaded?: { url: string }[]; error?: string };
      if (json.error) {
        toast.error(`Upload failed: ${json.error}`);
      } else {
        setUploadedFileUrls((json.uploaded ?? []).map(u => u.url));
      }
    } catch (err: any) {
      toast.error("Failed to upload files. Please try again.");
    } finally {
      setIsUploadingFiles(false);
    }
  };

  const submit = () => {
    if (!validateStep()) return;

    startTransition(async () => {
      const fd = new FormData();
      fd.append("store_location_id", storeLocationId);
      if (technicianId) fd.append("technician_id", technicianId);
      if (salesId) fd.append("sales_id", salesId);

      fd.append("customer_type", "User"); // Fixed as per new rules
      fd.append("customer_name", customerName);
      if (customerEmail) fd.append("customer_email", customerEmail);
      fd.append("phone", `+62${phone}`);

      fd.append("ticket_type", ticketType);
      
      // If they didn't explicitly pick a device_type enum, map it based on grid
      let finalDeviceType = deviceType;
      if (!finalDeviceType) {
        if (gridDevice === "Laptop") finalDeviceType = "Laptop_Office";
        else if (gridDevice === "Computer" || gridDevice === "Build PC") finalDeviceType = "PC_Office";
        else if (gridDevice === "Printer") finalDeviceType = "Printer";
        else finalDeviceType = "Other_Device";
      }
      fd.append("device_type", finalDeviceType);
      
      fd.append("pickup_method", pickupMethod);
      if (deviceName) fd.append("device_name", deviceName);
      if (deviceSn) fd.append("device_sn", deviceSn);
      if (ticketType === "warranty_claim") fd.append("purchase_date", purchaseDate);
      if (pcComponents.length > 0) {
        pcComponents.forEach((c) => fd.append("pcComponents", c));
      }
      fd.append("device_condition", conditions.join(", ")); // Saved to new field

      let accList = [...selectedAccessories];
      if (customAccessory.trim()) accList.push(customAccessory.trim());
      if (accList.length > 0) fd.append("accessories", accList.join(", "));

      if (notes) fd.append("notes", notes);
      
      // Auto diagnosis fee for service
      if (ticketType === "service" && checkDiagnosisFee) {
        fd.append("is_overnight_check", "1"); // Triggers the checking_fee in backend
      }

      if (ticketType === "cleaning" && cleaningPackage) fd.append("service_package", cleaningPackage);
      if (ticketType === "upgrade") {
        selectedUpgrades.forEach(id => fd.append("upgrade_ids", id));
      }
      
      uploadedFileUrls.forEach(url => fd.append("preuploaded_urls", url));
      fd.append("is_for_self", "0");

      try {
        const result = await createTicketAction(fd) as any;
        if (result?.error) {
          toast.error(result.error);
          setErrors({ submit: result.error });
        } else if (result?.redirectUrl) {
          toast.success("Ticket created successfully!");
          router.push(result.redirectUrl);
        }
      } catch (err: any) {
        console.error("Action error:", err);
        const errMsg = err.message ? `Error: ${err.message}` : "An unexpected error occurred.";
        toast.error(errMsg + " (Please try again)");
        setErrors({ submit: errMsg });
      }
    });
  };

  const toggleCondition = (val: string) => {
    setConditions(prev => prev.includes(val) ? prev.filter(c => c !== val) : [...prev, val]);
  };

  const toggleAccessory = (val: string) => {
    setSelectedAccessories(prev => prev.includes(val) ? prev.filter(a => a !== val) : [...prev, val]);
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

        {/* Step 1: Intake & Assign */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>Intake & Assignment</h2>
            
            <div style={{ display: "flex", gap: "1rem" }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Store Location *</label>
                <select className={`form-input ${errors.storeLocationId ? "error" : ""}`} value={storeLocationId} onChange={e => setStoreLocationId(e.target.value)}>
                  <option value="">Select Store</option>
                  {storeLocations.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                </select>
                {errors.storeLocationId && <span className="form-error"><AlertCircle size={12} />{errors.storeLocationId}</span>}
              </div>
            </div>

            <div style={{ display: "flex", gap: "1rem" }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Assign Technician</label>
                <select className="form-input" value={technicianId} onChange={e => setTechnicianId(e.target.value)}>
                  <option value="">(Assign Later)</option>
                  {technicians
                    .filter(t => !storeLocationId || t.store_assignments.some(sa => sa.store_id === storeLocationId))
                    .map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Assign Sales</label>
                <select className="form-input" value={salesId} onChange={e => setSalesId(e.target.value)}>
                  <option value="">(Assign Later)</option>
                  {sales.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            <hr style={{ margin: "1rem 0", borderColor: "var(--border)" }} />

            <h3 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Customer Information</h3>
            
            <div className="form-group">
              <label className="form-label">Customer Name *</label>
              <input className={`form-input ${errors.customerName ? "error" : ""}`} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="John Doe" />
              {errors.customerName && <span className="form-error"><AlertCircle size={12} />{errors.customerName}</span>}
            </div>

            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              <div className="form-group" style={{ flex: "1 1 250px" }}>
                <label className="form-label">Nomor HP / WhatsApp *</label>
                <div style={{ display: "flex", alignItems: "center", gap: "0" }}>
                  <span style={{ padding: "0.625rem 0.75rem", background: "var(--cream-dark)", border: "1.5px solid var(--border)", borderRight: "none", borderRadius: "var(--radius-md) 0 0 var(--radius-md)", fontSize: "0.9375rem", color: "var(--text-secondary)", fontWeight: 600, flexShrink: 0, lineHeight: "1.5" }}>+62</span>
                  <input
                    className={`form-input ${errors.phone ? "error" : ""}`}
                    style={{ borderLeft: "none", borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                    value={phone}
                    onFocus={() => setPhoneFocused(true)}
                    onBlur={() => setPhoneFocused(false)}
                    onChange={e => {
                      let val = e.target.value.replace(/\D/g, "");
                      if (val.startsWith("62")) val = val.substring(2);
                      else if (val.startsWith("0")) val = val.substring(1);
                      setPhone(val);
                    }}
                    placeholder="8123456789"
                  />
                </div>
                {phoneFocused && !phone.match(/^\d{9,13}$/) && (
                  <span style={{ fontSize: "0.75rem", color: "var(--accent-brand)", marginTop: "0.25rem", display: "block" }}>
                    Masukkan 9-13 digit angka.
                  </span>
                )}
                {errors.phone && <span className="form-error"><AlertCircle size={12} />{errors.phone}</span>}
              </div>

              <div className="form-group" style={{ flex: "1 1 250px" }}>
                <label className="form-label">Customer Email <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "0.8rem" }}>(opsional)</span></label>
                <input
                  type="email"
                  className={`form-input ${errors.customerEmail ? "error" : ""}`}
                  value={customerEmail}
                  onChange={e => setCustomerEmail(e.target.value)}
                  placeholder="customer@email.com"
                />
                {errors.customerEmail && <span className="form-error"><AlertCircle size={12} />{errors.customerEmail}</span>}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Choose Device Grid */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h2 style={{ marginBottom: "0.5rem", textAlign: "center" }}>Choose Device</h2>
            {errors.gridDevice && <div className="form-error" style={{ textAlign: "center", marginBottom: "1rem" }}><AlertCircle size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }}/>{errors.gridDevice}</div>}
            
            <div style={{ 
              display: "flex", 
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "1.25rem",
              marginTop: "0.5rem",
              maxWidth: "600px",
              margin: "0.5rem auto 0"
            }}>
              {DEVICES.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setGridDevice(d.id);
                    // Build PC has exactly one case, so it can be implied.
                    // Everything else waits for an explicit choice.
                    setTicketType(d.id === "Build PC" ? "pc_build" : "");
                  }}
                  style={{
                    flex: "1 1 140px",
                    maxWidth: "180px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "1rem",
                    padding: "2rem 1rem",
                    borderRadius: "16px",
                    border: `2px solid ${gridDevice === d.id ? "var(--primary)" : "var(--border)"}`,
                    background: gridDevice === d.id ? "rgba(22,70,157,0.06)" : "var(--white)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    color: gridDevice === d.id ? "var(--primary)" : "var(--text-secondary)",
                  }}
                >
                  <d.icon size={48} strokeWidth={1.5} />
                  <span style={{ fontWeight: 600, fontSize: "1.05rem" }}>{d.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Service Details */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <h2 style={{ marginBottom: "0" }}>Service Details: {gridDevice}</h2>
            
            {/* Case Selection Tabs */}
            {gridDevice !== "Build PC" && (
              <div>
                <label className="form-label" style={{ display: "block", marginBottom: "0.5rem" }}>
                  Jenis Kasus <span style={{ color: "var(--accent)" }}>*</span>
                </label>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", borderBottom: "1px solid var(--border)", paddingBottom: "1rem" }}>
                {getAvailableCases().map(caseType => {
                  const labels: Record<string, string> = { service: "Service", cleaning: "Cleaning", upgrade: "Upgrade Part", pc_build: "Build PC", warranty_claim: "Warranty Claim" };
                  return (
                    <button
                      key={caseType}
                      type="button"
                      onClick={() => setTicketType(caseType)}
                      style={{
                        flex: 1,
                        minWidth: "max-content",
                        textAlign: "center", 
                        borderRadius: "20px", 
                        padding: "0.5rem 0.5rem",
                        fontSize: "0.85rem",
                        whiteSpace: "nowrap",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.2s",
                        border: "none",
                        background: ticketType === caseType ? "var(--primary)" : "#1e293b",
                        color: "#fff",
                        boxShadow: ticketType === caseType ? "0 4px 12px rgba(22, 70, 157, 0.3)" : "none"
                      }}
                      onMouseEnter={e => {
                        if (ticketType !== caseType) {
                          e.currentTarget.style.background = "var(--primary)";
                        }
                      }}
                      onMouseLeave={e => {
                        if (ticketType !== caseType) {
                          e.currentTarget.style.background = "#1e293b";
                        }
                      }}
                    >
                      {labels[caseType]}
                    </button>
                  );
                })}
                </div>
              </div>
            )}
            {errors.ticketType && <span className="form-error" style={{ marginTop: "-1rem" }}><AlertCircle size={12} />{errors.ticketType}</span>}

            {/* Warranty Claim */}
            {ticketType === "warranty_claim" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
                  <div className="form-group">
                    <label className="form-label">
                      Nama Perangkat{" "}
                      <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(opsional)</span>
                    </label>
                    <input
                      className="form-input"
                      value={deviceName}
                      onChange={e => setDeviceName(e.target.value)}
                      placeholder="Misal: ASUS ROG G15"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      SN <span style={{ color: "var(--accent)" }}>*</span>
                    </label>
                    <input
                      className={`form-input ${errors.deviceSn ? "error" : ""}`}
                      value={deviceSn}
                      onChange={e => setDeviceSn(e.target.value)}
                      placeholder="Misal: 12345ABCD"
                    />
                    <p className="form-help">Diverifikasi ulang oleh RMA sebelum diajukan ke vendor.</p>
                    {errors.deviceSn && <span className="form-error"><AlertCircle size={12} />{errors.deviceSn}</span>}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Tanggal Pembelian <span style={{ color: "var(--accent)" }}>*</span>
                  </label>
                  <input
                    type="date"
                    className={`form-input ${errors.purchaseDate ? "error" : ""}`}
                    value={purchaseDate}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={e => setPurchaseDate(e.target.value)}
                  />
                  <p className="form-help">Sesuai tanggal pada nota pembelian.</p>
                  {errors.purchaseDate && <span className="form-error"><AlertCircle size={12} />{errors.purchaseDate}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Deskripsi Keluhan <span style={{ color: "var(--accent)" }}>*</span>
                  </label>
                  <textarea
                    className={`form-input ${errors.notes ? "error" : ""}`}
                    rows={4}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Jelaskan kerusakan yang diklaim customer..."
                  />
                  {errors.notes && <span className="form-error"><AlertCircle size={12} />{errors.notes}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Nota Pembelian{" "}
                    <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(opsional saat intake)</span>
                  </label>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                    Unggah foto/scan nota sekarang agar teknisi dapat memilihnya saat menyerahkan
                    unit ke RMA. Nota wajib ada sebelum klaim unit milik customer diserahkan ke RMA.
                  </p>
                  <FileUpload value={files} onChange={handleFileUpload} maxFiles={5} />
                  {isUploadingFiles && <p style={{ fontSize: "0.8rem", color: "var(--primary)", marginTop: "0.5rem" }}>⏳ Uploading files…</p>}
                </div>
              </div>
            )}

            {/* PC Build */}
            {ticketType === "pc_build" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div className="form-group">
                  <label className="form-label">PC Components (Optional)</label>
                  <TagInput
                    value={pcComponents}
                    onChange={setPcComponents}
                    placeholder="Type component name and press Enter (e.g. RTX 4060, i5-13400F)"
                  />
                  <p className="form-help">Enter the list of parts needed or provided for this PC Build.</p>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Notes / Instructions</label>
                  <textarea
                    className="form-input"
                    rows={4}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Describe any specific instructions or build requirements..."
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Ticket Attachment <span style={{ color: "var(--accent)" }}>*</span></label>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>Upload any reference pictures or build lists.</p>
                  <FileUpload value={files} onChange={handleFileUpload} maxFiles={5} />
                  {isUploadingFiles && <p style={{ fontSize: "0.8rem", color: "var(--primary)", marginTop: "0.5rem" }}>⏳ Uploading files…</p>}
                  {errors.ticketFiles && <span className="form-error"><AlertCircle size={12} />{errors.ticketFiles}</span>}
                </div>
              </div>
            )}

            {/* Service & Cleaning Shared Fields */}
            {(ticketType === "service" || ticketType === "cleaning") && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                
                {ticketType === "cleaning" && (
                  <div className="form-group" style={{ background: "var(--cream-dark)", padding: "1rem", borderRadius: "8px" }}>
                    <label className="form-label">Cleaning Package *</label>
                    <select className={`form-input ${errors.cleaningPackage ? "error" : ""}`} value={cleaningPackage} onChange={e => setCleaningPackage(e.target.value)}>
                      <option value="">Pilih Paket Cleaning</option>
                      <option value="Basic_Cleaning">Basic Cleaning</option>
                      {(gridDevice === "Laptop" || gridDevice === "Computer") && (
                        <option value="Full_Repaste">Full Cleaning + Repaste</option>
                      )}
                      {gridDevice === "Computer" && (
                        <option value="Full_Repaste_CPU_GPU">Full Cleaning + Repaste CPU & GPU</option>
                      )}
                    </select>
                    {errors.cleaningPackage && <span className="form-error"><AlertCircle size={12} />{errors.cleaningPackage}</span>}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div className="form-group">
                    <label className="form-label">Device Type *</label>
                    <select className={`form-input ${errors.deviceType ? "error" : ""}`} value={deviceType} onChange={e => setDeviceType(e.target.value)}>
                      <option value="">Pilih Kategori Spesifik</option>
                      {gridDevice === "Laptop" && (
                        <>
                          <option value="Laptop_Office">Laptop Office</option>
                          <option value="Laptop_Gaming">Laptop Gaming</option>
                        </>
                      )}
                      {gridDevice === "Computer" && (
                        <>
                          <option value="PC_Office">PC Office</option>
                          <option value="PC_Gaming">PC Gaming</option>
                        </>
                      )}
                      {gridDevice === "Printer" && <option value="Printer">Printer</option>}
                      {gridDevice === "Others" && <option value="Other_Device">Other Device</option>}
                    </select>
                    {errors.deviceType && <span className="form-error"><AlertCircle size={12} />{errors.deviceType}</span>}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Device Type (Nama) <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(opsional)</span></label>
                    <input className="form-input" value={deviceName} onChange={e => setDeviceName(e.target.value)} placeholder="Misal: ASUS ROG G15" />
                  </div>

                  <div className="form-group">
                    <label className="form-label">SN <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(opsional)</span></label>
                    <input className="form-input" value={deviceSn} onChange={e => setDeviceSn(e.target.value)} placeholder="Misal: 12345ABCD" />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Kondisi Perangkat <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(opsional)</span></label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "1.25rem", marginTop: "0.25rem" }}>
                    {["Garansi Aktif", "Garansi Habis", "Segel Utuh", "Fisik Mulus"].map(cond => (
                      <label key={cond} style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.95rem" }}>
                        <input type="checkbox" checked={conditions.includes(cond)} onChange={() => toggleCondition(cond)} style={{ width: "1.1rem", height: "1.1rem" }} />
                        {cond}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Kelengkapan Accessories</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "1.25rem", marginTop: "0.25rem", marginBottom: "0.75rem" }}>
                    {["Charger", "Kabel", "Bag"].map(acc => (
                      <label key={acc} style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.95rem" }}>
                        <input type="checkbox" checked={selectedAccessories.includes(acc)} onChange={() => toggleAccessory(acc)} style={{ width: "1.1rem", height: "1.1rem" }} />
                        {acc}
                      </label>
                    ))}
                  </div>
                  <input className="form-input" value={customAccessory} onChange={e => setCustomAccessory(e.target.value)} placeholder="Kelengkapan lain (custom)..." />
                </div>

                {ticketType === "service" && (
                  <div className="form-group">
                    <label className="form-label">Problem Description *</label>
                    <textarea className={`form-input ${errors.notes ? "error" : ""}`} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Provide details of the problem..." />
                    {errors.notes && <span className="form-error"><AlertCircle size={12} />{errors.notes}</span>}
                  </div>
                )}

                {ticketType === "service" && (
                  <div className="form-group" style={{ marginTop: "0.5rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer", background: "var(--cream)", padding: "1rem", borderRadius: "8px", border: "1px solid var(--border)" }}>
                      <input type="checkbox" checked={checkDiagnosisFee} onChange={e => setCheckDiagnosisFee(e.target.checked)} style={{ width: "1.25rem", height: "1.25rem" }} disabled />
                      <div>
                        <strong style={{ display: "block" }}>Check & Diagnosis</strong>
                        <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Fee of Rp. 50.000 (Automatically Applied)</span>
                      </div>
                    </label>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Ticket Attachment</label>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>Upload photo/video of the device.</p>
                  <FileUpload value={files} onChange={handleFileUpload} maxFiles={5} />
                  {isUploadingFiles && <p style={{ fontSize: "0.8rem", color: "var(--primary)", marginTop: "0.5rem" }}>⏳ Uploading files…</p>}
                </div>
              </div>
            )}

            {/* Upgrade Part */}
            {ticketType === "upgrade" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div className="form-group">
                  <label className="form-label">Select Upgrades *</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {upgrades
                      .filter(u => {
                        if (gridDevice === "Laptop") return u.name.includes("RAM") || u.name.includes("SSD");
                        return true;
                      })
                      .map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleUpgrade(u.id)}
                        style={{
                          padding: "0.5rem 1rem",
                          borderRadius: "20px",
                          border: `1.5px solid ${selectedUpgrades.includes(u.id) ? "var(--primary)" : "var(--border)"}`,
                          background: selectedUpgrades.includes(u.id) ? "var(--primary)" : "var(--white)",
                          color: selectedUpgrades.includes(u.id) ? "var(--white)" : "var(--text-secondary)",
                          fontSize: "0.9rem", cursor: "pointer", transition: "all 0.2s"
                        }}
                      >
                        {u.name}
                      </button>
                    ))}
                  </div>
                  {errors.selectedUpgrades && <span className="form-error"><AlertCircle size={12} />{errors.selectedUpgrades}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Attachment (Upgraded Item) *</label>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>Please attach a photo of the item to be upgraded.</p>
                  <FileUpload value={files} onChange={handleFileUpload} maxFiles={5} />
                  {isUploadingFiles && <p style={{ fontSize: "0.8rem", color: "var(--primary)", marginTop: "0.5rem" }}>⏳ Uploading files…</p>}
                </div>
              </div>
            )}

          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>Confirm Ticket Details</h2>
            <div style={{ background: "var(--cream)", padding: "1.5rem", borderRadius: "12px", fontSize: "0.95rem", lineHeight: "1.6" }}>
              <p><strong>Store:</strong> {storeLocations.find(s => s.id === storeLocationId)?.name}</p>
              <p><strong>Customer:</strong> {customerName} - +62{phone}</p>
              <p><strong>Device:</strong> {gridDevice} ({deviceType || "N/A"})</p>
              <p><strong>Case:</strong> <span style={{ textTransform: "capitalize" }}>{ticketType.replace(/_/g, " ")}</span></p>
              {ticketType === "cleaning" && <p><strong>Package:</strong> {cleaningPackage.replace(/_/g, " ")}</p>}
              {ticketType === "service" && <p><strong>Problem:</strong> {notes}</p>}
              {conditions.length > 0 && <p><strong>Condition:</strong> {conditions.join(", ")}</p>}
              {(selectedAccessories.length > 0 || customAccessory) && (
                <p><strong>Accessories:</strong> {[...selectedAccessories, customAccessory].filter(Boolean).join(", ")}</p>
              )}
            </div>
            
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", marginTop: "1rem" }}>
              <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} style={{ width: "1.25rem", height: "1.25rem" }} />
              <span style={{ fontWeight: 500 }}>I confirm the details above are accurate.</span>
            </label>
            {errors.termsAccepted && <span className="form-error"><AlertCircle size={12} />{errors.termsAccepted}</span>}
          </div>
        )}

        {/* Navigation Buttons */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2rem", gap: "0.75rem" }}>
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
              disabled={isPending || ticketType === "warranty_claim"}
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
