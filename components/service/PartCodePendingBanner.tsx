import { PackageSearch } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Top-of-ticket reminder: the service is finished and `count` of its parts
 * still have no Accurate code. The count comes from `partsAwaitingCodeCount`
 * (lib/part-code-alerts.ts); nothing is rendered at 0.
 */
export default function PartCodePendingBanner({ count, canLink }: { count: number; canLink: boolean }) {
  if (count <= 0) return null;
  return (
    <Alert variant="warning">
      <PackageSearch aria-hidden="true" />
      <AlertTitle className="font-semibold">
        {count} part belum punya kode Accurate
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-1">
        <p>
          Servis sudah selesai. Setelah barangnya diterima di Accurate, pilih sparepart yang benar-benar dipakai
          lewat <strong>Masukkan kode</strong> di Rincian Biaya — kasir butuh kodenya untuk memasukkan faktur ke
          Accurate.
        </p>
        {canLink ? (
          <a href="#rincian-biaya" className="w-fit font-medium text-primary">
            Ke Rincian Biaya ↓
          </a>
        ) : (
          <p>Teknisi yang memegang tiket ini atau admin yang bisa memasukkannya.</p>
        )}
      </AlertDescription>
    </Alert>
  );
}
