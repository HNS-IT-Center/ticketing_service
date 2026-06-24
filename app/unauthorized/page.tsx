import React from 'react';
import Link from 'next/link';

export default function UnauthorizedPage() {
  const portalUrl = "https://sso.hnsitcenter.id/portal";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white">
      <div className="card max-w-md w-full p-8 text-center bg-[#111111] border border-white/10 rounded-2xl shadow-xl">
        <h1 className="text-3xl font-bold mb-4 text-red-500">Access Denied</h1>
        <p className="text-gray-400 mb-8">
          For now you don't have any rights to this page. 
          If you believe this is a mistake, please contact the administrator.
        </p>
        <Link 
          href={portalUrl}
          className="btn btn-primary w-full py-3 rounded-lg flex items-center justify-center font-medium bg-white text-black hover:bg-gray-200 transition-colors"
        >
          Back to Portal
        </Link>
      </div>
    </div>
  );
}
