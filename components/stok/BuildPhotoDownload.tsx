"use client";

import { useState } from "react";
import { Check, Download, Images } from "lucide-react";
import { downloadHref } from "@/lib/download-name";
import type { FinishedPhoto } from "@/lib/stock";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * "Foto untuk Accurate" on Rakitan PC. One photo downloads straight away;
 * several open a picker — all ticked to start — that downloads each ticked
 * photo as its own file, as it was sent (no zip: the cashier uploads the
 * photos to Accurate one by one). Chrome asks once per site whether to allow
 * several downloads.
 */
export function BuildPhotoDownload({ code, photos }: { code: string; photos: FinishedPhoto[] }) {
  const [picked, setPicked] = useState<Set<number>>(() => new Set(photos.map((_, i) => i)));

  if (photos.length === 1) {
    const p = photos[0];
    return (
      <a
        href={downloadHref(p.url, p.fileName)}
        download
        className={buttonVariants({ variant: "outline", size: "sm", className: "justify-start whitespace-nowrap" })}
      >
        <Download aria-hidden /> Unduh {p.title.toLowerCase()}
      </a>
    );
  }

  const toggle = (i: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const all = picked.size === photos.length;
  const chosen = [...picked].sort((a, b) => a - b);
  // One <a download> per photo, a little apart: a burst in the same tick is
  // collapsed by some browsers into one download.
  const downloadChosen = async () => {
    for (const [n, i] of chosen.entries()) {
      if (n > 0) await new Promise((r) => setTimeout(r, 400));
      const a = document.createElement("a");
      a.href = downloadHref(photos[i].url, photos[i].fileName);
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  return (
    <Dialog onOpenChange={(open) => open && setPicked(new Set(photos.map((_, i) => i)))}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" className="justify-start whitespace-nowrap" />}
      >
        <Images aria-hidden /> Pilih &amp; unduh ({photos.length} foto)
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Foto rakitan {code}</DialogTitle>
          <DialogDescription>
            Ketuk foto untuk memilih. Setiap foto diunduh sebagai file aslinya. Bila browser bertanya, izinkan unduh beberapa file.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {picked.size} dari {photos.length} dipilih
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPicked(all ? new Set() : new Set(photos.map((_, i) => i)))}
          >
            {all ? "Kosongkan" : "Pilih semua"}
          </Button>
        </div>

        <ul className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
          {photos.map((p, i) => {
            const on = picked.has(i);
            return (
              <li key={p.url}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(i)}
                  className={cn(
                    "relative flex w-full flex-col overflow-hidden rounded-lg border-2 bg-muted text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    on ? "border-primary" : "border-transparent opacity-70",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.title} loading="lazy" className="aspect-square w-full object-cover" />
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-2 right-2 flex size-6 items-center justify-center rounded-full border-2 border-white shadow",
                      on ? "bg-primary text-primary-foreground" : "bg-black/30",
                    )}
                  >
                    {on && <Check className="size-4" />}
                  </span>
                  <span className="truncate bg-card px-2 py-1.5 text-xs font-medium">{p.title}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Tutup</DialogClose>
          <Button disabled={chosen.length === 0} onClick={downloadChosen}>
            <Download aria-hidden />
            {chosen.length === 0 ? "Pilih foto dulu" : `Unduh ${chosen.length} foto`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
