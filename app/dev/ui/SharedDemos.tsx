"use client";

import { useState } from "react";
import FileUpload from "@/components/ui/FileUpload";
import FilePreview from "@/components/ui/FilePreview";

/**
 * Shared form pieces that only appear deep inside a flow (a wizard step, a
 * status change), shown here so they can be checked without real data.
 */
export function SharedDemos() {
  const [files, setFiles] = useState<File[]>([]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">FileUpload — {files.length} berkas dipilih</p>
        <FileUpload onChange={setFiles} maxFiles={3} />
      </div>
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm font-medium text-foreground">FilePreview</p>
        <FilePreview url="/logo-hns.jpg" label="Lihat Lampiran" title="Logo HNS" />
      </div>
    </div>
  );
}
