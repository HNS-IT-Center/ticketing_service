"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, CheckCircle2, Clock, Lock, Camera, Eye, RefreshCcw } from "lucide-react";
import { uploadRevisionBuildAction, uploadFirstBuildAction } from "@/app/actions/sales";
import toast from "react-hot-toast";

interface PcBuildHandoverProps {
  ticketId: string;
  firstBuildUrl: string | null;
  revisionBuildUrl: string | null;
  status: string;
  userRole: string;
  isAssignedSales: boolean;
  isAssignedTechnician: boolean;
}

export default function PcBuildHandover({
  ticketId,
  firstBuildUrl,
  revisionBuildUrl,
  status,
  userRole,
  isAssignedSales,
  isAssignedTechnician,
}: PcBuildHandoverProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<"image" | "pdf" | null>(null);
  const [isReplacing, setIsReplacing] = useState(false);

  // First build upload state
  const [fbDragActive, setFbDragActive] = useState(false);
  const [fbFile, setFbFile] = useState<File | null>(null);
  const [fbPreviewUrl, setFbPreviewUrl] = useState<string | null>(null);
  const [fbFileType, setFbFileType] = useState<"image" | "pdf" | null>(null);
  const [fbIsReplacing, setFbIsReplacing] = useState(false);
  const [fbIsPending, startFbTransition] = useTransition();

  const isCompletedState = !["waiting", "on_progress"].includes(status);
  const canUpload = userRole === "Administrator" || (userRole === "Sales" && isAssignedSales) || (userRole === "Technician" && isAssignedTechnician);

  const isPdfUrl = (url: string | null) => url ? url.toLowerCase().includes(".pdf") : false;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type.startsWith("image/") || droppedFile.type === "application/pdf") {
        setFile(droppedFile);
        setPreviewUrl(URL.createObjectURL(droppedFile));
        setFileType(droppedFile.type === "application/pdf" ? "pdf" : "image");
      } else {
        toast.error("Please upload an image or PDF file");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type.startsWith("image/") || selectedFile.type === "application/pdf") {
        setFile(selectedFile);
        setPreviewUrl(URL.createObjectURL(selectedFile));
        setFileType(selectedFile.type === "application/pdf" ? "pdf" : "image");
      } else {
        toast.error("Please upload an image or PDF file");
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("ticketId", ticketId);
    formData.append("file", file);
    startTransition(async () => {
      const res = await uploadRevisionBuildAction(formData);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Revision build uploaded successfully!");
        setFile(null);
        setPreviewUrl(null);
        setFileType(null);
        setIsReplacing(false);
        router.refresh();
      }
    });
  };

  // ── First Build handlers ───────────────────────────────────────────────────
  const handleFbFileSelect = (selected: File) => {
    if (selected.type.startsWith("image/") || selected.type === "application/pdf") {
      setFbFile(selected);
      setFbPreviewUrl(URL.createObjectURL(selected));
      setFbFileType(selected.type === "application/pdf" ? "pdf" : "image");
    } else {
      toast.error("Please upload an image or PDF file");
    }
  };

  const handleFbDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFbDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFbFileSelect(e.dataTransfer.files[0]);
  };

  const handleFbUpload = () => {
    if (!fbFile) return;
    const formData = new FormData();
    formData.append("ticketId", ticketId);
    formData.append("file", fbFile);
    startFbTransition(async () => {
      const res = await uploadFirstBuildAction(formData);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("First build layout uploaded!");
        setFbFile(null);
        setFbPreviewUrl(null);
        setFbFileType(null);
        setFbIsReplacing(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="card" style={{ background: "linear-gradient(135deg, var(--white) 0%, #f9fafb 100%)", border: "1.5px solid var(--border-light)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            🖥️ PC Build Handover & Verification
          </h3>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            Track and verify physical hardware layouts before customer pickup.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }}>
        
        {/* First Build Layout */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <h4 style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.375rem", color: "var(--text-secondary)" }}>
            <Camera size={16} /> First Build (Technician)
          </h4>

          {firstBuildUrl && !fbIsReplacing ? (
            <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--border)", height: "220px", background: "#111" }}>
              {isPdfUrl(firstBuildUrl) ? (
                <iframe src={firstBuildUrl} style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#fff" }} title="First Build PDF" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={firstBuildUrl} alt="First Build Layout" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              )}
              <div style={{ position: "absolute", top: "0.75rem", right: "0.75rem", background: "rgba(22, 163, 74, 0.9)", color: "white", padding: "0.25rem 0.625rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.25rem", backdropFilter: "blur(4px)" }}>
                <CheckCircle2 size={12} /> Uploaded
              </div>
              <div style={{ position: "absolute", bottom: "0.75rem", right: "0.75rem", display: "flex", gap: "0.5rem" }}>
                {canUpload && (
                  <button onClick={() => setFbIsReplacing(true)} style={{ background: "rgba(255,255,255,0.9)", color: "#111", padding: "0.25rem 0.75rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, border: "none", cursor: "pointer", backdropFilter: "blur(4px)" }}>
                    Replace
                  </button>
                )}
                <a href={firstBuildUrl} target="_blank" rel="noopener noreferrer" style={{ background: "rgba(0,0,0,0.6)", color: "white", width: "2rem", height: "2rem", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", backdropFilter: "blur(4px)" }} title="View Full Size">
                  <Eye size={14} />
                </a>
              </div>
            </div>
          ) : fbPreviewUrl ? (
            <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--primary)", height: "220px", background: "#f3f4f6", display: "flex", flexDirection: "column" }}>
              {fbFileType === "pdf" ? (
                <iframe src={fbPreviewUrl} style={{ width: "100%", height: "170px", border: "none", backgroundColor: "#fff" }} title="First Build Preview PDF" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fbPreviewUrl} alt="First Build Preview" style={{ width: "100%", height: "170px", objectFit: "contain" }} />
              )}
              <div style={{ height: "50px", display: "flex", background: "var(--white)", borderTop: "1px solid var(--border-light)" }}>
                <button onClick={() => { setFbFile(null); setFbPreviewUrl(null); setFbIsReplacing(false); }} className="btn btn-ghost btn-sm" style={{ flex: 1, borderRadius: 0, height: "100%", borderRight: "1px solid var(--border-light)" }} disabled={fbIsPending}>
                  Cancel
                </button>
                <button onClick={handleFbUpload} className="btn btn-primary btn-sm" style={{ flex: 1, borderRadius: 0, height: "100%" }} disabled={fbIsPending}>
                  {fbIsPending ? "Uploading..." : "Confirm Upload"}
                </button>
              </div>
            </div>
          ) : canUpload ? (
            <div
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setFbDragActive(true); }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setFbDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setFbDragActive(false); }}
              onDrop={handleFbDrop}
              style={{ borderRadius: "12px", border: fbDragActive ? "2px dashed var(--primary)" : "1.5px dashed var(--border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "220px", background: fbDragActive ? "rgba(22,70,157,0.04)" : "var(--white)", color: "var(--text-muted)", gap: "0.5rem", cursor: "pointer", position: "relative", transition: "all 0.2s" }}
            >
              <input type="file" accept="image/*,application/pdf" onChange={(e) => e.target.files?.[0] && handleFbFileSelect(e.target.files[0])} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
              <Camera size={32} style={{ color: "var(--primary)" }} />
              <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>Upload first build layout</span>
              <span style={{ fontSize: "0.75rem" }}>Drag & drop or click to browse</span>
            </div>
          ) : (
            <div style={{ borderRadius: "12px", border: "1.5px dashed var(--border-light)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "220px", background: "#f9fafb", color: "var(--text-muted)", gap: "0.5rem", padding: "1rem", textAlign: "center" }}>
              <Lock size={28} style={{ opacity: 0.4 }} />
              <span style={{ fontSize: "0.8125rem", fontWeight: 500 }}>Awaiting first build upload</span>
              <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>Technician or admin can upload the layout here</span>
            </div>
          )}
        </div>

        {/* Revision Build Layout */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <h4 style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.375rem", color: "var(--text-secondary)" }}>
            <UploadCloud size={16} /> Revision Build
          </h4>

          {revisionBuildUrl && !isReplacing ? (
            <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--border)", height: "220px", background: "#111" }}>
              {isPdfUrl(revisionBuildUrl) ? (
                <iframe 
                  src={revisionBuildUrl} 
                  style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#fff" }}
                  title="Revision Build PDF"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img 
                  src={revisionBuildUrl} 
                  alt="Revision Build Layout" 
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              )}
              <div style={{ position: "absolute", top: "0.75rem", right: "0.75rem", background: "rgba(79, 70, 229, 0.9)", color: "white", padding: "0.25rem 0.625rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.25rem", backdropFilter: "blur(4px)" }}>
                <CheckCircle2 size={12} /> Revised
              </div>
              <div style={{ position: "absolute", bottom: "0.75rem", right: "0.75rem", display: "flex", gap: "0.5rem" }}>
                {canUpload && (
                  <button 
                    onClick={() => setIsReplacing(true)}
                    style={{ background: "rgba(255, 255, 255, 0.9)", color: "#111", padding: "0.25rem 0.75rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", border: "none", cursor: "pointer", backdropFilter: "blur(4px)" }}
                  >
                    Replace
                  </button>
                )}
                <a 
                  href={revisionBuildUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ background: "rgba(0, 0, 0, 0.6)", color: "white", width: "2rem", height: "2rem", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", backdropFilter: "blur(4px)" }}
                  title="View Full Size"
                >
                  <Eye size={14} />
                </a>
              </div>
            </div>
          ) : previewUrl ? (
            <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--primary)", height: "220px", background: "#f3f4f6", display: "flex", flexDirection: "column" }}>
              {fileType === "pdf" ? (
                <iframe 
                  src={previewUrl} 
                  style={{ width: "100%", height: "170px", border: "none", backgroundColor: "#fff" }}
                  title="Revision Preview PDF"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img 
                  src={previewUrl} 
                  alt="Revision Preview" 
                  style={{ width: "100%", height: "170px", objectFit: "contain" }}
                />
              )}
              <div style={{ height: "50px", display: "flex", background: "var(--white)", borderTop: "1px solid var(--border-light)" }}>
                <button 
                  onClick={() => { setFile(null); setPreviewUrl(null); setIsReplacing(false); }}
                  className="btn btn-ghost btn-sm"
                  style={{ flex: 1, borderRadius: 0, height: "100%", borderRight: "1px solid var(--border-light)" }}
                  disabled={isPending}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleUpload}
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1, borderRadius: 0, height: "100%" }}
                  disabled={isPending}
                >
                  {isPending ? "Uploading..." : "Confirm Upload"}
                </button>
              </div>
            </div>
          ) : canUpload ? (
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              style={{
                borderRadius: "12px",
                border: dragActive ? "2px dashed var(--primary)" : "1.5px dashed var(--border)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "220px",
                background: dragActive ? "rgba(79, 70, 229, 0.04)" : "var(--white)",
                color: "var(--text-muted)",
                gap: "0.5rem",
                cursor: "pointer",
                position: "relative",
                transition: "all 0.2s"
              }}
            >
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileChange}
                style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
              />
              <UploadCloud size={32} style={{ color: "var(--primary)" }} />
              <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>Upload revision layout</span>
              <span style={{ fontSize: "0.75rem" }}>Drag & drop or click to browse</span>
            </div>
          ) : (
            <div style={{ borderRadius: "12px", border: "1.5px dashed var(--border-light)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "220px", background: "#f9fafb", color: "var(--text-muted)", gap: "0.5rem", padding: "1rem", textAlign: "center" }}>
              <Lock size={28} style={{ opacity: 0.4 }} />
              <span style={{ fontSize: "0.8125rem", fontWeight: 500 }}>
                Access Restricted
              </span>
              <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>
                Only Administrators, assigned Sales, or Technician can upload
              </span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
