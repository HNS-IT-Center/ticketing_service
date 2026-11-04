"use client";

import { useState } from "react";
import FileUpload from "@/components/ui/FileUpload";
import FilePreview from "@/components/ui/FilePreview";
import TagInput from "@/components/ui/TagInput";
import RupiahInput from "@/components/service/RupiahInput";
import DraftBanner from "@/components/ui/DraftBanner";

/** A fixed moment, so the demo renders the same on the server and the client. */
const DEMO_SAVED_AT = Date.UTC(2026, 9, 31, 3, 15);

/**
 * Shared form pieces that only appear deep inside a flow (a wizard step, a
 * status change), shown here so they can be checked without real data.
 */
export function SharedDemos() {
  const [files, setFiles] = useState<File[]>([]);
  const [tags, setTags] = useState<string[]>(["RAM 16GB", "SSD 1TB"]);
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
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">TagInput — Enter atau koma menambah</p>
        <TagInput value={tags} onChange={setTags} placeholder="Ketik komponen lalu Enter..." />
      </div>
      <div className="flex flex-col gap-2">
        <RupiahInput name="demo-rupiah" label="Omzet jasa / bulan" defaultValue={1500000} />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">DraftBanner — di dialog Serahkan Unit ke RMA</p>
        <DraftBanner
          savedAt={DEMO_SAVED_AT}
          note="Foto/video kerusakan dan nota perlu dipilih ulang."
          onRestore={() => {}}
          onDiscard={() => {}}
        />
      </div>
    </div>
  );
}
