import { ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/session";
import { loadAccessOverrides } from "@/lib/access-server";
import { AUDIENCES, CAPABILITIES, audienceAllowed, ruleKey } from "@/lib/access";
import { PageHeader } from "@/components/app/PageHeader";
import AccessMatrixForm from "./AccessMatrixForm";

export const metadata = { title: "Pengaturan Akses — HNS IT Center" };

export default async function AccessSettingsPage() {
  await requireRole("Administrator");
  const overrides = await loadAccessOverrides();
  const allowed = CAPABILITIES.flatMap((c) =>
    AUDIENCES.filter((a) => audienceAllowed(c, a, overrides)).map((a) => ruleKey(c, a))
  );

  return (
    <div data-slot="access-settings" className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-6" /> Pengaturan Akses
          </span>
        }
        description="Siapa yang boleh melihat dan mengubah harga service, memperbaiki data tiket, dan melihat stok gudang mana. Head Teknisi ditandai di halaman Users; Koordinator Toko adalah teknisi bertanda Team Leader."
      />
      <AccessMatrixForm allowed={allowed} />
    </div>
  );
}
