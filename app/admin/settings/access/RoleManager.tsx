"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Lock, Pencil, Plus, RotateCcw, Search, ShieldCheck, Users } from "lucide-react";
import type { Role } from "@prisma/client";
import { createAccessRoleAction, deleteAccessRoleAction, updateAccessRoleAction } from "@/app/actions/access";
import { DeleteEntryButton } from "@/components/app/DeleteEntryButton";
import { FormField } from "@/components/app/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { type Capability } from "@/lib/access";
import { accessGroupsFor } from "@/lib/access-groups";
import { BASE_AUDIENCE, BASE_HINTS, BASE_LABELS, ROLE_BASES, grantableFor, templateFor, type RoleBase } from "@/lib/access-roles";
import { isHandledActionError } from "@/lib/navigation-signal";
import { navFor } from "@/lib/nav";
import { cn } from "@/lib/utils";

export type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  base: RoleBase;
  grants: Capability[];
  /** Active accounts holding it — what the card shows. */
  users: number;
  /** Every account holding it, deactivated ones too — what blocks a delete. */
  holders: number;
};

/** Capabilities that open money, destruction or other people's accounts. */
const SENSITIVE: Capability[] = ["view_cost", "view_finance_report", "delete_ticket", "manage_users", "view_stock_griya", "view_stock_batam"];

type Draft = {
  id: string | null;
  name: string;
  description: string;
  base: RoleBase;
  grants: Set<Capability>;
  /** What "Berubah" compares with: the saved grants, or the base's defaults for a new role. */
  baseline: Set<Capability>;
  holders: number;
};

type Filter = "all" | "on" | "changed";

/**
 * Pengguna & Akses → Role & Izin, as approved in mockup v2 (2026-11-18): every
 * role in one list, each with edit and delete, and one side panel to make or
 * change a role — details, then what it may open, page by page, with the
 * sidebar it will produce beside it.
 */
export function RoleManager({ roles, owners }: { roles: RoleRow[]; owners: number }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return roles.filter((r) => !q || `${r.name} ${r.description ?? ""} ${BASE_LABELS[r.base]}`.toLowerCase().includes(q));
  }, [roles, query]);

  const openNew = () => {
    const base: RoleBase = "Sales";
    const t = new Set(templateFor(base));
    setDraft({ id: null, name: "", description: "", base, grants: t, baseline: new Set(t), holders: 0 });
  };
  const openEdit = (r: RoleRow) =>
    setDraft({ id: r.id, name: r.name, description: r.description ?? "", base: r.base, grants: new Set(r.grants), baseline: new Set(r.grants), holders: r.holders });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari role…" aria-label="Cari role" className="pl-9" />
        </div>
        <Button type="button" onClick={openNew}>
          <Plus aria-hidden="true" /> Tambah role
        </Button>
      </div>

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <li>
          <div className="flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-4" title="Owner selalu punya semua akses">
            <CardTop name="Owner" description="Pemilik usaha: semua akses dan semua toko, termasuk Role & Izin. Tidak bisa dibatasi." locked />
            <CardFoot left="Semua izin" users={owners} base={null} />
          </div>
        </li>
        {shown.map((r) => {
          const total = grantableFor(r.base).length;
          return (
            <li key={r.id}>
              <div className="flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-4">
                <CardTop
                  name={r.name}
                  description={r.description}
                  actions={
                    <>
                      <Button type="button" variant="ghost" size="icon" className="size-11 md:size-9" aria-label={`Ubah ${r.name}`} title="Ubah" onClick={() => openEdit(r)}>
                        <Pencil aria-hidden="true" />
                      </Button>
                      <DeleteEntryButton
                        name={r.name}
                        what="role"
                        className="size-11 border-0 bg-transparent md:size-9"
                        blockedReason={r.holders > 0 ? `Masih dipakai ${r.holders} akun` : null}
                        description={`Role ${r.name} dihapus. Belum ada akun yang memakainya. Tercatat di Log Aktivitas.`}
                        onDelete={() => deleteAccessRoleAction(r.id)}
                      />
                    </>
                  }
                />
                <CardFoot left={`${r.grants.length} / ${total} izin`} users={r.users} base={r.base} />
              </div>
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
            Tidak ada role yang cocok dengan &quot;{query}&quot;.
          </li>
        )}
      </ul>

      {draft && (
        <RoleEditor
          key={draft.id ?? "new"}
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function CardTop({ name, description, locked, actions }: { name: string; description: string | null; locked?: boolean; actions?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <ShieldCheck className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
          {name}
          {locked && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              <Lock aria-hidden="true" className="size-3" /> Terkunci
            </span>
          )}
        </span>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </span>
      {actions && <span className="-mt-1 -mr-1 flex shrink-0 items-center gap-1">{actions}</span>}
    </div>
  );
}

function CardFoot({ left, users, base }: { left: string; users: number; base: RoleBase | null }) {
  return (
    <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <ShieldCheck aria-hidden="true" className="size-3.5" /> {left}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Users aria-hidden="true" className="size-3.5" /> {users} user
      </span>
      {base && (
        <span className="rounded-full border border-tone-blue-border bg-tone-blue-bg px-2 py-0.5 font-semibold text-tone-blue-fg">
          {BASE_LABELS[base]}
        </span>
      )}
    </div>
  );
}

function RoleEditor({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState(draft);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isNew = d.id === null;
  const baseLocked = !isNew && d.holders > 0;

  const groups = useMemo(() => accessGroupsFor(BASE_AUDIENCE[d.base]), [d.base]);
  const grantable = useMemo(() => grantableFor(d.base), [d.base]);
  const has = (c: Capability) => d.grants.has(c);
  const changed = (c: Capability) => d.grants.has(c) !== d.baseline.has(c);

  const setMany = (caps: Capability[], on: boolean) =>
    setD((prev) => {
      const next = new Set(prev.grants);
      for (const c of caps) {
        if (on) next.add(c);
        else next.delete(c);
      }
      return { ...prev, grants: next };
    });

  const changeBase = (base: RoleBase) => {
    const t = new Set(templateFor(base));
    setD((prev) => ({ ...prev, base, grants: t, baseline: isNew ? new Set(t) : prev.baseline }));
    toast(`Izin diatur ke bawaan ${BASE_LABELS[base]}.`);
  };

  const needle = q.trim().toLowerCase();
  const visibleGroups = groups
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          (!needle || `${i.label} ${i.hint} ${g.title}`.toLowerCase().includes(needle)) &&
          (filter === "all" || (filter === "on" ? has(i.capability) : changed(i.capability))),
      ),
    }))
    .filter((g) => g.items.length > 0);

  const preview = navFor(d.base as Role, (c) => d.grants.has(c));
  const added = grantable.filter((c) => d.grants.has(c) && !d.baseline.has(c)).length;
  const removed = grantable.filter((c) => !d.grants.has(c) && d.baseline.has(c)).length;
  const sensitive = SENSITIVE.filter((c) => grantable.includes(c) && d.grants.has(c));

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("name", d.name);
    fd.set("description", d.description);
    fd.set("base", d.base);
    for (const c of grantable) if (d.grants.has(c)) fd.append("grant", c);
    startTransition(async () => {
      try {
        const res = d.id ? await updateAccessRoleAction(d.id, fd) : await createAccessRoleAction(fd);
        if ("error" in res) {
          setError(res.error);
          return;
        }
        toast.success(isNew ? `Role ${d.name.trim()} dibuat.` : `Role ${d.name.trim()} disimpan.`);
        onSaved();
      } catch (e) {
        if (isHandledActionError(e)) return;
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <Sheet open onOpenChange={(open) => !open && !pending && onClose()}>
      <SheetContent side="right" className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-5xl">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle>{isNew ? "Tambah role" : d.name || "(tanpa nama)"}</SheetTitle>
          <SheetDescription>
            {isNew ? "Isi detail, lalu centang halaman dan fitur yang boleh dibuka." : `${BASE_LABELS[d.base]} · ${d.holders} akun`}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="flex min-w-0 flex-col gap-5">
              <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold">Detail role</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField label="Nama role" htmlFor="role-name" required>
                    <Input id="role-name" value={d.name} maxLength={60} placeholder="mis. Kasir" onChange={(e) => setD({ ...d, name: e.target.value })} />
                  </FormField>
                  <FormField
                    label="Tipe dasar"
                    htmlFor="role-base"
                    help={baseLocked ? `Tidak bisa diganti: dipakai ${d.holders} akun.` : BASE_HINTS[d.base]}
                  >
                    <NativeSelect id="role-base" value={d.base} disabled={baseLocked} onChange={(e) => changeBase(e.target.value as RoleBase)}>
                      {ROLE_BASES.map((b) => (
                        <option key={b} value={b}>
                          {BASE_LABELS[b]}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                </div>
                <FormField label="Keterangan" htmlFor="role-desc" hint=" (opsional)">
                  <Textarea id="role-desc" rows={2} value={d.description} placeholder="mis. Buat tiket dan cetak faktur di meja depan" onChange={(e) => setD({ ...d, description: e.target.value })} />
                </FormField>
                {d.base === "Administrator" && (
                  <p className="rounded-lg border border-tone-amber-border bg-tone-amber-bg px-3 py-2 text-xs text-tone-amber-fg">
                    Role bertipe dasar Admin hanya bisa diberikan ke akun oleh Owner.
                  </p>
                )}
              </section>

              <section className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-sm font-semibold">Izin per halaman</h3>
                  <span className="text-xs text-muted-foreground">Menu orang dengan role ini mengikuti centangan di bawah.</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-full sm:w-64">
                    <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari halaman atau izin…" aria-label="Cari izin" className="pl-9" />
                  </div>
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Tampilkan">
                    {(
                      [
                        ["all", "Semua"],
                        ["on", "Dicentang"],
                        ["changed", "Berubah"],
                      ] as const
                    ).map(([k, label]) => (
                      <Button key={k} type="button" size="sm" variant={filter === k ? "default" : "outline"} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                        {label}
                      </Button>
                    ))}
                  </div>
                  <Button type="button" size="sm" variant="ghost" className="sm:ml-auto" onClick={() => setD({ ...d, grants: new Set(templateFor(d.base)) })}>
                    <RotateCcw aria-hidden="true" /> Pakai bawaan {BASE_LABELS[d.base]}
                  </Button>
                </div>

                {visibleGroups.length === 0 && (
                  <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Tidak ada izin yang cocok.</p>
                )}
                {visibleGroups.map((g) => {
                  const caps = g.items.map((i) => i.capability);
                  const on = caps.filter(has).length;
                  return (
                    <section key={g.key} className="overflow-hidden rounded-xl border border-border bg-card">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
                        <h4 className="text-sm font-semibold">
                          {g.title} <span className="ml-1 text-xs font-normal text-muted-foreground">{on} / {caps.length}</span>
                        </h4>
                        <div className="flex gap-1">
                          <Button type="button" size="sm" variant="ghost" className="text-primary" onClick={() => setMany(caps, true)}>
                            Pilih semua
                          </Button>
                          <Button type="button" size="sm" variant="ghost" className="text-primary" onClick={() => setMany(caps, false)}>
                            Kosongkan
                          </Button>
                        </div>
                      </div>
                      <ul>
                        {g.items.map((i) => (
                          <li key={i.capability} className="border-t border-border first:border-t-0">
                            <label className="flex min-h-11 cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-muted/40">
                              <input
                                type="checkbox"
                                className="mt-0.5 size-4 shrink-0 accent-primary"
                                checked={has(i.capability)}
                                onChange={(e) => setMany([i.capability], e.target.checked)}
                              />
                              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="text-sm font-medium">{i.label}</span>
                                <span className="text-xs text-muted-foreground">{i.hint}</span>
                              </span>
                              {changed(i.capability) && (
                                <span className="shrink-0 text-xs font-semibold text-tone-amber-fg">{has(i.capability) ? "+ ditambah" : "− dicabut"}</span>
                              )}
                            </label>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </section>
            </div>

            <aside className="flex flex-col gap-3 max-lg:order-first lg:sticky lg:top-0">
              <div className="flex flex-col gap-0.5 rounded-xl bg-sidebar bg-linear-170 from-sidebar to-sidebar-end p-3 text-sidebar-foreground" aria-label="Pratinjau menu">
                <span className="px-2 pb-2 text-[0.6875rem] font-semibold tracking-wider uppercase opacity-75">
                  Pratinjau sidebar · {d.name.trim() || "role baru"}
                </span>
                {preview.length === 0 && <span className="px-2 py-1 text-xs opacity-80">Belum ada halaman. Orang dengan role ini tidak bisa membuka apa pun.</span>}
                {preview.map((s, si) => (
                  <div key={s.key} className="flex flex-col gap-0.5">
                    {s.title && <span className="px-2 pt-2 text-[0.6875rem] opacity-70">{s.title}</span>}
                    {s.items.map((it, ii) => (
                      <span key={it.href} className={cn("rounded-md px-2 py-1.5 text-sm", si === 0 && ii === 0 && "bg-sidebar-accent font-semibold")}>
                        {it.label}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-xs">
                <p>
                  <span className="text-2xl font-bold tabular-nums">{grantable.filter((c) => d.grants.has(c)).length}</span>
                  <span className="text-muted-foreground"> / {grantable.length} izin dicentang</span>
                </p>
                <p className="flex justify-between text-muted-foreground">
                  {isNew ? "Ditambah dari bawaan" : "Ditambah"} <b className="text-foreground tabular-nums">{added}</b>
                </p>
                <p className="flex justify-between text-muted-foreground">
                  Dicabut <b className="text-foreground tabular-nums">{removed}</b>
                </p>
                {sensitive.length > 0 ? (
                  <p className="rounded-lg border border-tone-amber-border bg-tone-amber-bg p-2 text-tone-amber-fg">
                    Akses sensitif: {sensitive.map((c) => groups.flatMap((g) => g.items).find((i) => i.capability === c)?.label ?? c).join(", ")}.
                  </p>
                ) : (
                  <p className="text-muted-foreground">Tidak ada akses sensitif.</p>
                )}
              </div>
            </aside>
          </div>
        </div>

        <SheetFooter className="flex-row flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {error ? <span role="alert" className="text-sm text-destructive">{error}</span> : !isNew && d.holders > 0 ? `Berlaku untuk ${d.holders} akun saat halaman berikutnya dibuka.` : null}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Batal
            </Button>
            <Button type="button" onClick={save} disabled={pending || !d.name.trim()}>
              {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
              {isNew ? "Buat role" : "Simpan"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
