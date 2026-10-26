import { isSsoConfigured } from "@/lib/sso/config";
import { localLoginMode } from "@/lib/auth/local-login";
import { LoginOptionsProvider } from "./login-options";

// Force the login route to be fully dynamic.
// This prevents Next.js from prerendering it as static HTML,
// which would cause stale Server Action hashes and cookie-setting
// failures when the build is redeployed in production. It also means the
// sign-in options below follow the environment at request time.
export const dynamic = "force-dynamic";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <LoginOptionsProvider value={{ ssoEnabled: isSsoConfigured(), localLogin: localLoginMode() }}>
      {children}
    </LoginOptionsProvider>
  );
}
