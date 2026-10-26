import Link from "next/link";
import { AlertTriangle, LogOut, RotateCw } from "lucide-react";
import { ssoLogoutUrlWithoutHint } from "@/lib/sso/urls";

export const metadata = { title: "Masuk dengan SSO — HNS IT Center" };

/** What each failure means to the person in front of it, and what they can do. */
const MESSAGES: Record<string, { title: string; body: string }> = {
  access_denied: {
    title: "Anda belum diberi akses",
    body: "Akun SSO Anda belum diberi akses ke HNS Ticketing Service. Minta akses ke admin HNS IT Center, lalu coba lagi.",
  },
  login_required: {
    title: "Sesi SSO belum aktif",
    body: "Silakan masuk lagi ke SSO HNS.",
  },
  interaction_required: {
    title: "Perlu masuk ulang",
    body: "SSO HNS meminta Anda masuk ulang. Silakan coba lagi.",
  },
  flow_expired: {
    title: "Proses masuk kedaluwarsa",
    body: "Halaman masuk dibuka terlalu lama atau di tab lain. Silakan ulangi dari awal.",
  },
  callback_failed: {
    title: "Proses masuk tidak selesai",
    body: "Login dari SSO tidak dapat diverifikasi. Silakan coba lagi; bila tetap gagal, hubungi admin.",
  },
  sso_unreachable: {
    title: "SSO HNS tidak dapat dihubungi",
    body: "Server SSO sedang tidak bisa dijangkau. Coba lagi beberapa saat.",
  },
  inactive: {
    title: "Akun dinonaktifkan",
    body: "Akun Anda dinonaktifkan di aplikasi ini. Hubungi admin aplikasi.",
  },
  email_conflict: {
    title: "Akun bentrok",
    body: "Email akun SSO Anda sudah dipakai akun lain di aplikasi ini. Hubungi admin untuk menautkannya.",
  },
  customer_account: {
    title: "Email terdaftar sebagai customer",
    body: "Email ini tercatat sebagai akun customer di aplikasi ini, sehingga tidak bisa dipakai untuk akun staf. Hubungi admin.",
  },
  no_email: {
    title: "Email tidak tersedia",
    body: "SSO tidak mengirimkan email untuk akun Anda. Hubungi admin HNS IT Center.",
  },
};

const FALLBACK = {
  title: "Gagal masuk dengan SSO",
  body: "Terjadi kesalahan saat masuk. Silakan coba lagi; bila tetap gagal, hubungi admin.",
};

export default async function SsoErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const message = (code && MESSAGES[code]) || FALLBACK;
  const ssoLogout = ssoLogoutUrlWithoutHint();

  return (
    <div className="auth-container">
      <div className="auth-card flex flex-col gap-6 p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertTriangle size={36} style={{ color: "var(--accent-brand, #b45309)" }} />
          <h1 className="text-xl font-semibold">{message.title}</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {message.body}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {/* A route handler that redirects off-site: it needs a full page
              navigation, which <Link> would turn into a client-side fetch. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/auth/sso/login" className="btn btn-primary flex items-center justify-center gap-2">
            <RotateCw size={16} /> Coba lagi
          </a>
          {ssoLogout && (
            <a href={ssoLogout} className="btn btn-outline flex items-center justify-center gap-2">
              <LogOut size={16} /> Keluar dari SSO HNS
            </a>
          )}
          <Link href="/login" className="btn btn-ghost">
            Kembali ke halaman masuk
          </Link>
        </div>
      </div>
    </div>
  );
}
