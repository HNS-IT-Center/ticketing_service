/**
 * What can appear in the activity log (/admin/activity), and how it reads.
 * Pure — no database — so the page, the writer and the tests share it.
 *
 * An action is "<area>.<verb>". Adding one is a line here; the filter and the
 * labels follow. Nothing may be written under a name that is not listed, so a
 * typo fails `tsc` instead of appearing as raw text in the log.
 */
import type { TicketStatus } from "@prisma/client";
import { ticketStatusDisplay } from "./status-display";

export const ACTIVITY_AREAS = {
  auth: "Login",
  ticket: "Tiket",
  charge: "Rincian Biaya",
  rma: "RMA",
  master: "Data Master",
  user: "Pengguna",
  setting: "Pengaturan",
  export: "Export",
} as const;

export type ActivityArea = keyof typeof ACTIVITY_AREAS;

export const ACTIVITY_ACTIONS = {
  "auth.login": { area: "auth", label: "Masuk" },
  "auth.login_failed": { area: "auth", label: "Gagal masuk" },
  "auth.logout": { area: "auth", label: "Keluar" },

  "ticket.create": { area: "ticket", label: "Buat tiket" },
  "ticket.status": { area: "ticket", label: "Ubah status" },
  "ticket.assign": { area: "ticket", label: "Tugaskan" },
  "ticket.request": { area: "ticket", label: "Minta tiket" },
  "ticket.request_cancel": { area: "ticket", label: "Batal minta tiket" },
  "ticket.request_decide": { area: "ticket", label: "Putuskan permintaan" },
  "ticket.notes": { area: "ticket", label: "Ubah catatan" },
  "ticket.edit": { area: "ticket", label: "Ubah data tiket" },
  "ticket.pickup": { area: "ticket", label: "Ubah pengambilan" },
  "ticket.message": { area: "ticket", label: "Kirim pesan" },
  "ticket.attachment": { area: "ticket", label: "Unggah lampiran" },
  "ticket.public_chat": { area: "ticket", label: "Chat publik" },
  "ticket.build_upload": { area: "ticket", label: "Unggah foto rakitan" },
  "ticket.delivery_proof": { area: "ticket", label: "Bukti pengiriman" },
  "ticket.delete": { area: "ticket", label: "Hapus tiket" },

  "charge.add": { area: "charge", label: "Tambah biaya" },
  "charge.update": { area: "charge", label: "Ubah biaya" },
  "charge.remove": { area: "charge", label: "Hapus biaya" },
  "charge.receive_external": { area: "charge", label: "Terima service eksternal" },
  "part.add": { area: "charge", label: "Catat part" },
  "part.remove": { area: "charge", label: "Hapus part" },
  "part.link_code": { area: "charge", label: "Isi kode Accurate" },

  "rma.handover": { area: "rma", label: "Serahkan ke RMA" },
  "rma.transition": { area: "rma", label: "Ubah tahap RMA" },
  "rma.hold_evidence": { area: "rma", label: "Kirim bukti" },

  "vendor.create": { area: "master", label: "Tambah vendor" },
  "vendor.update": { area: "master", label: "Ubah vendor" },
  "vendor.delete": { area: "master", label: "Hapus vendor" },
  "service_job.create": { area: "master", label: "Tambah jasa" },
  "service_job.update": { area: "master", label: "Ubah jasa" },
  "service_job.delete": { area: "master", label: "Hapus jasa" },
  "service_job.accurate": { area: "master", label: "Kode Accurate jasa" },
  "store.create": { area: "master", label: "Tambah toko" },
  "store.update": { area: "master", label: "Ubah toko" },
  "store.delete": { area: "master", label: "Hapus toko" },
  "store.assign": { area: "master", label: "Teknisi ke toko" },
  "store.unassign": { area: "master", label: "Teknisi dari toko" },

  "user.create": { area: "user", label: "Tambah pengguna" },
  "user.update": { area: "user", label: "Ubah pengguna" },
  "user.deactivate": { area: "user", label: "Nonaktifkan pengguna" },
  "profile.update": { area: "user", label: "Ubah profil" },
  "profile.password": { area: "user", label: "Ganti password" },
  "profile.title": { area: "user", label: "Pasang gelar" },

  "access.update": { area: "setting", label: "Ubah pengaturan akses" },
  "target.update": { area: "setting", label: "Ubah target" },
  "schedule.leave": { area: "setting", label: "Atur cuti" },
  "schedule.override": { area: "setting", label: "Tukar shift" },
  "leaderboard.snapshot": { area: "setting", label: "Simpan leaderboard" },

  "export.tickets": { area: "export", label: "Export tiket" },
  "export.claims": { area: "export", label: "Export klaim" },
  "export.parts": { area: "export", label: "Export laporan part" },
} as const satisfies Record<string, { area: ActivityArea; label: string }>;

export type ActivityAction = keyof typeof ACTIVITY_ACTIONS;

export function isActivityArea(value: string): value is ActivityArea {
  return Object.prototype.hasOwnProperty.call(ACTIVITY_AREAS, value);
}

/** The label for a stored action; a name since removed from the catalogue shows as written. */
export function activityLabel(action: string): string {
  return (ACTIVITY_ACTIONS as Record<string, { label: string }>)[action]?.label ?? action;
}

export function activityArea(action: string): ActivityArea | null {
  const area = (ACTIVITY_ACTIONS as Record<string, { area: ActivityArea }>)[action]?.area;
  return area ?? null;
}

/** Every action in one area — what the page's area filter selects. */
export function actionsInArea(area: ActivityArea): ActivityAction[] {
  return (Object.keys(ACTIVITY_ACTIONS) as ActivityAction[]).filter((a) => ACTIVITY_ACTIONS[a].area === area);
}

/** Where an entry's record lives in the admin portal, when it has a page. */
export function activityEntityHref(type: string | null, id: string | null): string | null {
  if (!type || !id) return null;
  switch (type) {
    case "ticket":
      return `/admin/tickets/${id}`;
    case "user":
      return `/admin/users/${id}`;
    case "store":
      return `/admin/stores/${id}`;
    case "rma_case":
      return `/rma/cases/${id}`;
    default:
      return null;
  }
}

/** A ticket status as staff read it ("On Progress"), for log sentences. */
export function ticketStatusText(status: string): string {
  try {
    return ticketStatusDisplay(status as TicketStatus).label || status;
  } catch {
    return status;
  }
}
