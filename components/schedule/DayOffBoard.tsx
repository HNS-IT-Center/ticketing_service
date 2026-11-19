"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AlertTriangle, CalendarOff, Loader2, Pencil, ShieldCheck, UserCheck } from "lucide-react";
import { saveDayOffRuleAction } from "@/app/actions/day-off";
import { clashDays, listDays, MAX_DAYS_OFF, NOTE_MAX, spread, WEEK, WEEKDAY_LABELS, WEEKDAY_SHORT, type Weekday } from "@/lib/day-off";
import type { DayOffMember } from "@/lib/day-off-server";
import { FormField } from "@/components/app/FormField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Libur tetap per teknisi (owner, 2026-11-19; Data Accurate "Jadwal & Libur",
 * part A): which weekdays each one is off, who covers them, and how the days
 * off spread over the week so they do not pile up. `canEdit` = the viewer holds
 * "Kelola jadwal teknisi"; the server checks it again on save.
 */
export function DayOffBoard({ members, canEdit }: { members: DayOffMember[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<DayOffMember | null>(null);
  const perDay = useMemo(() => spread(members.map((m) => m.workDays)), [members]);
  const setCount = members.filter((m) => m.daysOff).length;
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-bold">
          <CalendarOff aria-hidden className="size-[18px] text-primary" /> Libur tetap & pengganti
        </CardTitle>
        <CardDescription>
          {setCount} dari {members.length} teknisi sudah diatur. Pengganti mendapat notifikasi dan tercatat di jadwal; tiket tidak dipindahkan otomatis.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada teknisi di toko ini.</p>
        ) : (
          <>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Yang libur per hari</p>
              <ol className="grid grid-cols-7 gap-1.5" aria-label="Jumlah teknisi libur per hari">
                {WEEK.map((d) => (
                  <li
                    key={d}
                    className={cn(
                      "flex flex-col items-center rounded-md border px-1 py-1.5 text-center",
                      perDay[d] > 0 ? "border-tone-blue-border bg-tone-blue-bg text-tone-blue-fg" : "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    <span className="text-[0.6875rem] font-medium">{WEEKDAY_SHORT[d]}</span>
                    <span className="text-base font-bold tabular-nums">{perDay[d]}</span>
                  </li>
                ))}
              </ol>
            </div>

            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {members.map((m) => {
                const rep = m.replacement ? byId.get(m.replacement.id) : undefined;
                const clash = m.daysOff && rep ? clashDays(m.daysOff, rep.daysOff) : [];
                return (
                  <li
                    key={m.id}
                    className={cn("flex flex-col gap-2.5 rounded-lg border p-4", m.daysOff ? "border-border bg-card" : "border-dashed border-border bg-card")}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-foreground">
                      {m.isLead && <ShieldCheck aria-label="Koordinator" className="size-4 shrink-0 text-primary" />}
                      <span className="truncate">{m.name}</span>
                    </div>
                    <DayChips daysOff={m.daysOff} />
                    {m.daysOff ? (
                      m.replacement ? (
                        <p className="flex items-center gap-1.5 text-sm text-foreground">
                          <UserCheck aria-hidden className="size-4 shrink-0 text-tone-green-fg" /> Digantikan {m.replacement.name}
                        </p>
                      ) : (
                        <p className="flex items-center gap-1.5 text-sm text-tone-amber-fg">
                          <AlertTriangle aria-hidden className="size-4 shrink-0" /> Tanpa pengganti tetap
                        </p>
                      )
                    ) : (
                      <p className="text-sm text-muted-foreground">Libur belum diatur.</p>
                    )}
                    {clash.length > 0 && (
                      <p className="flex items-center gap-1.5 text-sm text-tone-amber-fg">
                        <AlertTriangle aria-hidden className="size-4 shrink-0" /> Pengganti juga libur hari {listDays(clash)}
                      </p>
                    )}
                    {m.note && <p className="text-xs whitespace-pre-line text-muted-foreground">{m.note}</p>}
                    {canEdit && (
                      <Button variant="outline" className="mt-auto w-full" onClick={() => setEditing(m)}>
                        <Pencil aria-hidden /> {m.daysOff ? "Ubah" : "Atur libur"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>

      {editing && <DayOffDialog key={editing.id} member={editing} members={members} perDay={perDay} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function DayChips({ daysOff }: { daysOff: Weekday[] | null }) {
  return (
    <ol className="flex flex-wrap gap-1" aria-label={daysOff ? `Libur ${listDays(daysOff)}` : "Libur belum diatur"}>
      {WEEK.map((d) => {
        const off = daysOff?.includes(d) ?? false;
        return (
          <li
            key={d}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold",
              off ? "border-tone-blue-border bg-tone-blue-bg text-tone-blue-fg" : "border-border bg-muted text-muted-foreground",
            )}
          >
            {WEEKDAY_SHORT[d]}
          </li>
        );
      })}
    </ol>
  );
}

function DayOffDialog({
  member,
  members,
  perDay,
  onClose,
}: {
  member: DayOffMember;
  members: DayOffMember[];
  perDay: Record<Weekday, number>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [days, setDays] = useState<Weekday[]>(member.daysOff ?? []);
  const [replacementId, setReplacementId] = useState(member.replacement?.id ?? "");
  const [note, setNote] = useState(member.note ?? "");
  const [error, setError] = useState<string | null>(null);

  // Colleagues who can stand in: another technician of one of the same stores.
  const candidates = members.filter((o) => o.id !== member.id && o.storeIds.some((s) => member.storeIds.includes(s)));
  const replacement = candidates.find((c) => c.id === replacementId);
  const clash = replacement ? clashDays(days, replacement.daysOff) : [];

  const toggle = (d: Weekday) => {
    setError(null);
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : cur.length >= MAX_DAYS_OFF ? cur : WEEK.filter((x) => x === d || cur.includes(x))));
  };

  const save = () => {
    if (days.length === 0) return setError("Pilih minimal satu hari libur.");
    startTransition(async () => {
      const res = await saveDayOffRuleAction({ technicianId: member.id, daysOff: days, replacementId: replacementId || null, note });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      toast.success(`Libur tetap ${member.name} disimpan`);
      onClose();
      router.refresh();
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Libur tetap {member.name}</DialogTitle>
          <DialogDescription>Hari libur setiap minggu, maksimal {MAX_DAYS_OFF} hari. Hari lainnya dihitung hari kerja.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium text-foreground">Hari libur *</legend>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
              {WEEK.map((d) => {
                const on = days.includes(d);
                const others = perDay[d] - (member.daysOff?.includes(d) ? 1 : 0);
                const full = !on && days.length >= MAX_DAYS_OFF;
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    disabled={full || pending}
                    onClick={() => toggle(d)}
                    className={cn(
                      "flex min-h-11 flex-col items-center justify-center rounded-lg border px-1 py-1.5 text-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-foreground hover:bg-muted",
                    )}
                  >
                    <span className="text-sm font-semibold">{WEEKDAY_SHORT[d]}</span>
                    <span className={cn("text-[0.625rem]", on ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {others > 0 ? `${others} lain libur` : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <FormField label="Pengganti tetap" htmlFor="dayoff-replacement" help="Rekan yang menggantikan pada hari liburnya.">
            <NativeSelect id="dayoff-replacement" value={replacementId} disabled={pending} onChange={(e) => setReplacementId(e.target.value)}>
              <option value="">Tanpa pengganti (rekan bisa ambil alih sendiri)</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.daysOff ? `libur ${c.daysOff.map((d) => WEEKDAY_SHORT[d]).join(", ")}` : "libur belum diatur"}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {clash.length > 0 && (
            <p role="status" className="flex items-center gap-1.5 text-sm text-tone-amber-fg">
              <AlertTriangle aria-hidden className="size-4 shrink-0" />
              {replacement?.name} juga libur hari {clash.map((d) => WEEKDAY_LABELS[d]).join(", ")}.
            </p>
          )}

          <FormField label="Catatan" htmlFor="dayoff-note" hint=" (opsional)">
            <Textarea id="dayoff-note" value={note} maxLength={NOTE_MAX} rows={2} disabled={pending} onChange={(e) => setNote(e.target.value)} />
          </FormField>

          {member.updatedByName && <p className="text-xs text-muted-foreground">Terakhir diubah {member.updatedByName}.</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Batal
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 aria-hidden className="animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
