"use client";

import { createContext, useContext } from "react";
import type { LocalLoginMode } from "@/lib/auth/local-login";

/**
 * Which sign-in methods the login page offers, decided on the server from the
 * environment and handed down by app/login/layout.tsx.
 *
 * Passed through context rather than by making the page a server component:
 * the page was deliberately reverted to a pure client component in b8137d9
 * after CSS broke when it was rendered on the server.
 */
export type LoginOptions = { ssoEnabled: boolean; localLogin: LocalLoginMode };

const LoginOptionsContext = createContext<LoginOptions>({ ssoEnabled: false, localLogin: "all" });

export function LoginOptionsProvider({
  value,
  children,
}: {
  value: LoginOptions;
  children: React.ReactNode;
}) {
  return <LoginOptionsContext.Provider value={value}>{children}</LoginOptionsContext.Provider>;
}

export function useLoginOptions(): LoginOptions {
  return useContext(LoginOptionsContext);
}
