import React from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";

/**
 * Where a signed-in account with no portal of its own lands.
 *
 * proxy.ts lets this route through before every other check, so it renders for
 * any session and for none. That matters: it is the redirect target for a
 * denied role, and sending such a session to /login instead would bounce it
 * straight back here — the redirect loop this page exists to break.
 *
 * Logging out is therefore the primary action: without it a denied account has
 * no way to clear its own cookie and sign in as someone else.
 */
export default function UnauthorizedPage() {
  const portalUrl = "https://sso.hnsitcenter.id/portal";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white p-4">
      <div className="card max-w-md w-full p-8 text-center bg-[#111111] border border-white/10 rounded-2xl shadow-xl">
        <h1 className="text-3xl font-bold mb-4 text-red-500">Access Denied</h1>
        <p className="text-gray-400 mb-8">
          For now you don&apos;t have any rights to this page. If you believe this is a
          mistake, please contact the administrator.
        </p>

        <div className="flex flex-col gap-3">
          <form action={logoutAction}>
            <button
              type="submit"
              className="btn btn-primary w-full py-3 rounded-lg flex items-center justify-center gap-2 font-medium bg-white text-black hover:bg-gray-200 transition-colors"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </form>

          <Link
            href={portalUrl}
            className="w-full py-3 rounded-lg flex items-center justify-center font-medium text-gray-300 border border-white/10 hover:bg-white/5 transition-colors"
          >
            Back to Portal
          </Link>
        </div>
      </div>
    </div>
  );
}
