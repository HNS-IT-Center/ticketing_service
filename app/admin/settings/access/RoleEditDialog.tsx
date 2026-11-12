"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, RotateCcw } from "lucide-react";
import { saveAudienceAccessAction } from "@/app/actions/access";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { isNavigationSignal } from "@/lib/navigation-signal";
import type { Audience, Capability } from "@/lib/access";
import type { AccessGroup } from "@/lib/access-groups";
import { cn } from "@/lib/utils";

/**
 * A role card that opens its settings in a dialog, on the same page (owner,
 * 2026-11-12: "langsung pop up modal aja jangan pindah halaman"). The settings
 * sit in boxes, each with "Pilih semua" / "Kosongkan"; what is posted is what
 * is ticked. A setting that differs from the default is marked, and
 * "Kembalikan ke bawaan" ticks the defaults again.
 */
export default function RoleEditDialog({
  audience,
  label,
  hint,
  groups,
  allowed,
  defaults,
  className,
  children,
}: {
  audience: Audience;
  label: string;
  hint: string;
  groups: AccessGroup[];
  allowed: Capability[];
  defaults: Capability[];
  /** The card's classes; the card itself is the button that opens the dialog. */
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [on, setOn] = useState(() => new Set<Capability>(allowed));
  const isDefault = new Set(defaults);
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  const setMany = (caps: Capability[], value: boolean) =>
    setOn((prev) => {
      const next = new Set(prev);
      for (const c of caps) {
        if (value) next.add(c);
        else next.delete(c);
      }
      return next;
    });

  // Every opening starts from what is saved, not from a closed, unsaved edit.
  const onOpenChange = (next: boolean) => {
    if (pending) return;
    if (next) setOn(new Set(allowed));
    setOpen(next);
  };

  const submit = (formData: FormData) =>
    startTransition(async () => {
      try {
        const res = await saveAudienceAccessAction(audience, formData);
        if ("error" in res) {
          toast.error(res.error);
          return;
        }
        toast.success(`Izin ${label} disimpan.`);
        setOpen(false);
        router.refresh();
      } catch (err) {
        // Next moving the page (e.g. the login ran out) is not a failure.
        if (isNavigationSignal(err)) return;
        toast.error("Gagal menyimpan izin role.");
      }
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={<button type="button" aria-label={`Ubah izin ${label}`} className={cn("w-full cursor-pointer text-left", className)} />}
      >
        {children}
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col gap-0 p-0 sm:max-w-4xl">
        <form action={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="gap-1 border-b border-border p-4 pr-12">
            <DialogTitle>Ubah role · {label}</DialogTitle>
            <DialogDescription>{hint}</DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Izin <span className="font-semibold text-foreground">({on.size} dari {total} dipilih)</span>
              </p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOn(new Set(defaults))}>
                <RotateCcw aria-hidden="true" /> Kembalikan ke bawaan
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {groups.map((g) => {
                const caps = g.items.map((i) => i.capability);
                const all = caps.every((c) => on.has(c));
                return (
                  <fieldset key={g.key} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
                    <legend className="sr-only">{g.title}</legend>
                    <div className="flex items-start justify-between gap-3">
                      <span aria-hidden="true" className="flex flex-col gap-0.5">
                        <span className="font-semibold text-foreground">{g.title}</span>
                        {g.hint && <span className="text-xs text-muted-foreground">{g.hint}</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => setMany(caps, !all)}
                        aria-label={`${all ? "Kosongkan" : "Pilih semua"}: ${g.title}`}
                        className="min-h-9 shrink-0 rounded-md px-2 text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {all ? "Kosongkan" : "Pilih semua"}
                      </button>
                    </div>
                    <ul className="flex flex-col">
                      {g.items.map((item) => {
                        const checked = on.has(item.capability);
                        const changed = checked !== isDefault.has(item.capability);
                        return (
                          <li key={item.capability}>
                            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60 md:min-h-0">
                              <input
                                type="checkbox"
                                name={item.capability}
                                checked={checked}
                                onChange={(e) => setMany([item.capability], e.target.checked)}
                                className="mt-0.5 size-5 shrink-0 accent-primary md:size-4"
                              />
                              <span className="flex min-w-0 flex-col gap-0.5">
                                <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                                  {item.label}
                                  {changed && (
                                    <span
                                      title={isDefault.has(item.capability) ? "Bawaannya diizinkan" : "Bawaannya tidak diizinkan"}
                                      className="rounded-full border border-tone-amber-border bg-tone-amber-bg px-1.5 py-px text-[0.65rem] font-semibold text-tone-amber-fg"
                                    >
                                      diubah
                                    </span>
                                  )}
                                </span>
                                <span className="text-xs text-muted-foreground">{item.hint}</span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </fieldset>
                );
              })}
            </div>
          </div>

          <DialogFooter className="mx-0 mb-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
              {pending ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
