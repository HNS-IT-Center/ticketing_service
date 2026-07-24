// Force the login route to be fully dynamic.
// This prevents Next.js from prerendering it as static HTML,
// which would cause stale Server Action hashes and cookie-setting
// failures when the build is redeployed in production.
export const dynamic = "force-dynamic";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
