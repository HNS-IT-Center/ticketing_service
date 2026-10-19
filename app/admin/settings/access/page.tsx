import { ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/session";
import { loadAccessOverrides } from "@/lib/access-server";
import { AUDIENCES, CAPABILITIES, audienceAllowed, ruleKey } from "@/lib/access";
import AccessMatrixForm from "./AccessMatrixForm";

export const metadata = { title: "Pengaturan Akses — HNS IT Center" };

export default async function AccessSettingsPage() {
  await requireRole("Administrator");
  const overrides = await loadAccessOverrides();
  const allowed = CAPABILITIES.flatMap((c) =>
    AUDIENCES.filter((a) => audienceAllowed(c, a, overrides)).map((a) => ruleKey(c, a))
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2">
          <ShieldCheck size={22} /> Pengaturan Akses
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Siapa yang boleh melihat dan mengubah harga service. Head Teknisi ditandai di halaman
          Users; Koordinator Toko adalah teknisi bertanda Team Leader.
        </p>
      </div>
      <AccessMatrixForm allowed={allowed} />
    </div>
  );
}
