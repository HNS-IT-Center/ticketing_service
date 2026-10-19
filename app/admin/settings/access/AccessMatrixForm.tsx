"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { saveAccessRulesAction } from "@/app/actions/access";
import {
  AUDIENCES,
  AUDIENCE_LABELS,
  CAPABILITIES,
  CAPABILITY_INFO,
  type Audience,
  type Capability,
} from "@/lib/access";

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
      } catch {
        toast.error("Gagal menyimpan pengaturan akses.");
      }
    });

  const cell = (capability: Capability, audience: Audience) => {
    const name = `${capability}:${audience}`;
    const isAdmin = audience === "administrator";
    const isDefault = CAPABILITY_INFO[capability].defaults.includes(audience);
    return (
      <td key={audience} style={{ textAlign: "center" }}>
        <input
          type="checkbox"
          name={name}
          defaultChecked={isAdmin || on.has(name)}
          disabled={isAdmin}
          title={isAdmin ? "Admin selalu punya akses" : isDefault ? "Default: diizinkan" : "Default: tidak diizinkan"}
          style={{ width: "1.1rem", height: "1.1rem", cursor: isAdmin ? "not-allowed" : "pointer" }}
        />
      </td>
    );
  };

  return (
    <form action={submit} className="card flex flex-col gap-4 p-4">
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Kemampuan</th>
              {AUDIENCES.map((a) => (
                <th key={a} style={{ textAlign: "center", whiteSpace: "nowrap" }}>{AUDIENCE_LABELS[a]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAPABILITIES.map((c) => (
              <tr key={c}>
                <td>
                  <div className="flex flex-col gap-1">
                    <span style={{ fontWeight: 600 }}>{CAPABILITY_INFO[c].label}</span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>{CAPABILITY_INFO[c].hint}</span>
                  </div>
                </td>
                {AUDIENCES.map((a) => cell(c, a))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan pengaturan"}
        </button>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Seseorang mendapat akses bila salah satu kelompoknya diizinkan — mis. koordinator
          toko juga termasuk Teknisi.
        </span>
      </div>
    </form>
  );
}
