"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, CheckCircle2, Lock, Camera, Eye, Loader2 } from "lucide-react";
import { uploadRevisionBuildAction, uploadFirstBuildAction } from "@/app/actions/sales";
import toast from "react-hot-toast";
import { compressFile, normalizeFileType } from "@/lib/compress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      let droppedFile = normalizeFileType(e.dataTransfer.files[0]);
      if (droppedFile.type.startsWith("image/") || droppedFile.type.startsWith("video/") || droppedFile.type === "application/pdf") {
        toast("Processing file...", { id: "compress", icon: "⏳" });
        droppedFile = await compressFile(droppedFile);
        toast.dismiss("compress");

        setFile(droppedFile);
        setPreviewUrl(URL.createObjectURL(droppedFile));
        setFileType(droppedFile.type === "application/pdf" ? "pdf" : "image");
      } else {
        toast.error("Please upload an image, video, or PDF file");
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      let selectedFile = normalizeFileType(e.target.files[0]);
      if (selectedFile.type.startsWith("image/") || selectedFile.type.startsWith("video/") || selectedFile.type === "application/pdf") {
        toast("Processing file...", { id: "compress", icon: "⏳" });
        selectedFile = await compressFile(selectedFile);
        toast.dismiss("compress");

        setFile(selectedFile);
        setPreviewUrl(URL.createObjectURL(selectedFile));
        setFileType(selectedFile.type === "application/pdf" ? "pdf" : "image");
      } else {
        toast.error("Please upload an image, video, or PDF file");
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("ticketId", ticketId);
    formData.append("file", file);
    startTransition(async () => {
      try {
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
      } catch (err) {
        console.error("Action error:", err);
        const message = err instanceof Error ? err.message : "";
        if (message.includes("Unexpected end of form") || message.includes("Body exceeded")) {
          toast.error("Upload failed: File size is too large. Please limit to 10MB.");
        } else {
          toast.error("An unexpected error occurred. Please try again.");
        }
      }
    });
  };

  // ── First Build handlers ───────────────────────────────────────────────────
  const handleFbFileSelect = async (selected: File) => {
    let normalized = normalizeFileType(selected);
    if (normalized.type.startsWith("image/") || normalized.type.startsWith("video/") || normalized.type === "application/pdf") {
      toast("Processing file...", { id: "compress", icon: "⏳" });
      normalized = await compressFile(normalized);
      toast.dismiss("compress");

      setFbFile(normalized);
      setFbPreviewUrl(URL.createObjectURL(normalized));
      setFbFileType(normalized.type === "application/pdf" ? "pdf" : "image");
    } else {
      toast.error("Please upload an image, video, or PDF file");
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
      try {
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
      } catch (err) {
        console.error("Action error:", err);
        const message = err instanceof Error ? err.message : "";
        if (message.includes("Unexpected end of form") || message.includes("Body exceeded")) {
          toast.error("Upload failed: File size is too large. Please limit to 10MB.");
        } else {
          toast.error("An unexpected error occurred. Please try again.");
        }
      }
    });
  };

  // The two columns go through the same four states — uploaded, previewing a
  // pick, empty and droppable, or locked — so each state is drawn once here.
  const frame = "relative flex h-[220px] flex-col overflow-hidden rounded-xl border";

  const uploadedView = (url: string, title: string, badge: React.ReactNode, onReplace?: () => void) => (
    <div className={cn(frame, "border-border bg-[#111]")}>
      {isPdfUrl(url) ? (
        <iframe src={url} className="size-full border-0 bg-white" title={`${title} PDF`} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`${title} Layout`} className="size-full object-contain" />
      )}
      {badge}
      <div className="absolute right-3 bottom-3 flex gap-2">
        {onReplace && (
          <button
            type="button"
            onClick={onReplace}
            className="flex min-h-11 items-center rounded-full bg-white/90 px-3 text-xs font-semibold text-[#111] backdrop-blur-sm md:min-h-8"
          >
            Replace
          </button>
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="View Full Size"
          aria-label={`View ${title} full size`}
          className="flex size-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm md:size-8"
        >
          <Eye aria-hidden="true" className="size-3.5" />
        </a>
      </div>
    </div>
  );

  const badge = (label: string, tone: string) => (
    <div className={cn("absolute top-3 right-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm", tone)}>
      <CheckCircle2 aria-hidden="true" className="size-3" /> {label}
    </div>
  );

  const previewView = (
    url: string,
    type: "image" | "pdf" | null,
    title: string,
    onCancel: () => void,
    onConfirm: () => void,
    pending: boolean,
  ) => (
    <div className={cn(frame, "border-primary bg-gray-100")}>
      {type === "pdf" ? (
        <iframe src={url} className="h-[170px] w-full border-0 bg-white" title={`${title} PDF`} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={title} className="h-[170px] w-full object-contain" />
      )}
      <div className="grid h-[50px] grid-cols-2 border-t border-border bg-card">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending} className="h-full rounded-none border-r border-border">
          Cancel
        </Button>
        <Button type="button" onClick={onConfirm} disabled={pending} className="h-full rounded-none">
          {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
          {pending ? "Uploading..." : "Confirm Upload"}
        </Button>
      </div>
    </div>
  );

  const dropzone = (
    active: boolean,
    handlers: Pick<React.HTMLAttributes<HTMLDivElement>, "onDragEnter" | "onDragOver" | "onDragLeave" | "onDrop">,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
    Icon: typeof Camera,
    label: string,
  ) => (
    <div
      {...handlers}
      className={cn(
        "relative flex h-[220px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-dashed bg-card text-muted-foreground transition-all focus-within:ring-3 focus-within:ring-ring/50",
        active ? "border-2 border-primary bg-primary/5" : "border-[1.5px] border-input",
      )}
    >
      <input
        type="file"
        accept="image/*,video/*,application/pdf,image/heic,image/heif"
        onChange={onChange}
        aria-label={label}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
      <Icon aria-hidden="true" className="size-8 text-primary" />
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <span className="text-xs">Drag &amp; drop or click to browse</span>
    </div>
  );

  const lockedView = (title: string, detail: string) => (
    <div className="flex h-[220px] flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-border bg-muted/50 p-4 text-center text-muted-foreground">
      <Lock aria-hidden="true" className="size-7 opacity-40" />
      <span className="text-[0.8125rem] font-medium">{title}</span>
      <span className="text-xs opacity-80">{detail}</span>
    </div>
  );

  const columnTitle = "flex items-center gap-1.5 text-sm font-semibold text-muted-foreground";

  return (
    <Card className="border-[1.5px] border-border bg-[linear-gradient(135deg,var(--card)_0%,#f9fafb_100%)] ring-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <span aria-hidden="true">🖥️</span> PC Build Handover &amp; Verification
        </CardTitle>
        <CardDescription className="text-[0.8125rem]">
          Track and verify physical hardware layouts before customer pickup.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-6">
        {/* First Build Layout */}
        <section className="flex flex-col gap-3">
          <h4 className={columnTitle}>
            <Camera aria-hidden="true" className="size-4" /> First Build (Technician)
          </h4>

          {firstBuildUrl && !fbIsReplacing
            ? uploadedView(firstBuildUrl, "First Build", badge("Uploaded", "bg-green-600/90"))
            : fbPreviewUrl
              ? previewView(
                  fbPreviewUrl,
                  fbFileType,
                  "First Build Preview",
                  () => { setFbFile(null); setFbPreviewUrl(null); setFbIsReplacing(false); },
                  handleFbUpload,
                  fbIsPending,
                )
              : canUpload
                ? dropzone(
                    fbDragActive,
                    {
                      onDragEnter: (e) => { e.preventDefault(); e.stopPropagation(); setFbDragActive(true); },
                      onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); setFbDragActive(true); },
                      onDragLeave: (e) => { e.preventDefault(); e.stopPropagation(); setFbDragActive(false); },
                      onDrop: handleFbDrop,
                    },
                    (e) => { if (e.target.files?.[0]) handleFbFileSelect(e.target.files[0]); },
                    Camera,
                    "Upload first build layout",
                  )
                : lockedView("Awaiting first build upload", "Technician or admin can upload the layout here")}
        </section>

        {/* Revision Build Layout */}
        <section className="flex flex-col gap-3">
          <h4 className={columnTitle}>
            <UploadCloud aria-hidden="true" className="size-4" /> Revision Build
          </h4>

          {revisionBuildUrl && !isReplacing
            ? uploadedView(
                revisionBuildUrl,
                "Revision Build",
                badge("Revised", "bg-indigo-600/90"),
                canUpload ? () => setIsReplacing(true) : undefined,
              )
            : previewUrl
              ? previewView(
                  previewUrl,
                  fileType,
                  "Revision Preview",
                  () => { setFile(null); setPreviewUrl(null); setIsReplacing(false); },
                  handleUpload,
                  isPending,
                )
              : canUpload
                ? dropzone(
                    dragActive,
                    { onDragEnter: handleDrag, onDragOver: handleDrag, onDragLeave: handleDrag, onDrop: handleDrop },
                    handleFileChange,
                    UploadCloud,
                    "Upload revision layout",
                  )
                : lockedView("Access Restricted", "Only Administrators, assigned Sales, or Technician can upload")}
        </section>
      </CardContent>
    </Card>
  );
}
