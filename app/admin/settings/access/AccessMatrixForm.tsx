"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { saveAccessRulesAction } from "@/app/actions/access";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AUDIENCES,
  AUDIENCE_LABELS,
  CAPABILITIES,
  CAPABILITY_INFO,
  type Audience,
  type Capability,
} from "@/lib/access";
import { isNavigationSignal } from "@/lib/navigation-signal";

export default function AccessMatrixForm({
  allowed,
}: {
  /** "capability:audience" keys currently allowed. */
  allowed: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const on = new Set(allowed);

  const submit = (formData: FormData) =>
    startTransition(async () => {
      try {
        await saveAccessRulesAction(formData);
        toast.success("Pengaturan akses disimpan.");
        router.refresh();
      } catch (err) {
        // Next moving the page (e.g. the login ran out) is not a failure.
        if (isNavigationSignal(err)) return;
        toast.error("Gagal menyimpan pengaturan akses.");
      }
    });

  // One labelled checkbox per audience. A table needed the column header to
  // say what a box meant, and at 360px it scrolled sideways; a labelled box
  // reads on its own at any width. Same names, same defaults, same form.
  const cell = (capability: Capability, audience: Audience) => {
    const name = `${capability}:${audience}`;
    const isAdmin = audience === "administrator";
    const isDefault = CAPABILITY_INFO[capability].defaults.includes(audience);
    return (
      <label
        key={audience}
        title={isAdmin ? "Admin selalu punya akses" : isDefault ? "Default: diizinkan" : "Default: tidak diizinkan"}
        className={cn(
          "flex min-h-11 items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-sm md:min-h-9",
          isAdmin ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:border-primary/40",
        )}
      >
        <input
          type="checkbox"
          name={name}
          defaultChecked={isAdmin || on.has(name)}
          disabled={isAdmin}
          className="size-5 shrink-0 accent-primary md:size-4"
        />
        <span>{AUDIENCE_LABELS[audience]}</span>
      </label>
    );
  };

  return (
    <form action={submit} data-slot="access-matrix" className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {CAPABILITIES.map((c) => (
          <li key={c}>
            <fieldset className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
              <legend className="sr-only">{CAPABILITY_INFO[c].label}</legend>
              <div className="flex flex-col gap-0.5" aria-hidden="true">
                <span className="font-semibold text-foreground">{CAPABILITY_INFO[c].label}</span>
                <span className="text-xs text-muted-foreground">{CAPABILITY_INFO[c].hint}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                {AUDIENCES.map((a) => cell(c, a))}
              </div>
            </fieldset>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
          {pending ? "Menyimpan…" : "Simpan pengaturan"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Seseorang mendapat akses bila salah satu kelompoknya diizinkan — mis. koordinator
          toko juga termasuk Teknisi.
        </span>
      </div>
    </form>
  );
}
