"use client";

import { usePathname } from "next/navigation";
import { ThemeProvider as NextThemes } from "next-themes";
import { forcesLightTheme } from "@/lib/theme";

/**
 * Terang / Gelap (owner, 2026-11-18): each person picks in the top bar, the
 * choice is kept in their own browser, and the default is light. There is no
 * "follow the device" option — the owner asked for exactly two.
 *
 * Pages that are printed or sent to a customer (invoice, the public ticket
 * page) are always light, whatever the staff member chose: what goes on paper
 * or to a customer must not depend on someone's screen setting.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <NextThemes
      attribute="class"
      defaultTheme="light"
      themes={["light", "dark"]}
      enableSystem={false}
      storageKey="hns-theme"
      disableTransitionOnChange
      forcedTheme={forcesLightTheme(pathname) ? "light" : undefined}
    >
      {children}
    </NextThemes>
  );
}
