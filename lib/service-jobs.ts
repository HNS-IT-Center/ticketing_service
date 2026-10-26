/**
 * The Daftar Jasa as pure rules: what a job record may hold, read from a form.
 * No database, so the actions, the pages and the tests share one reading.
 */

import { parseRupiah } from "@/lib/charges";

export const MAX_JOB_POINTS = 100;
export const MAX_JOB_NAME = 120;

export type ServiceJobOption = { id: string; name: string; default_price: number | null; points: number };

export type ServiceJobInput = { name: string; default_price: number | null; points: number };

/** A job as the Daftar Jasa forms post it, or why it cannot be stored. */
export function readServiceJob(formData: FormData): { ok: true; value: ServiceJobInput } | { ok: false; error: string } {
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, error: "Nama jasa minimal 2 karakter." };
  if (name.length > MAX_JOB_NAME) return { ok: false, error: `Nama jasa maksimal ${MAX_JOB_NAME} karakter.` };

  const price = parseRupiah(String(formData.get("default_price") ?? ""));
  if (!price.ok) return { ok: false, error: "Harga default tidak valid. Tulis angka saja, mis. 150000." };

  const rawPoints = String(formData.get("points") ?? "").trim();
  const points = rawPoints === "" ? 0 : Number(rawPoints);
  if (!Number.isInteger(points) || points < 0 || points > MAX_JOB_POINTS) {
    return { ok: false, error: `Poin harus angka bulat 0–${MAX_JOB_POINTS}.` };
  }
  return { ok: true, value: { name, default_price: price.value, points } };
}
