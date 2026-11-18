"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const noop = () => () => {};

/**
 * One button in the top bar: shows the theme you would switch to. The theme
 * is only known in the browser (it lives in localStorage), so until hydration
 * the button renders a neutral placeholder of the same size rather than a
 * guess that would flicker.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  const label = dark ? "Ganti ke tema terang" : "Ganti ke tema gelap";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-11 md:size-9"
            aria-label={mounted ? label : "Tema"}
            onClick={() => setTheme(dark ? "light" : "dark")}
          />
        }
      >
        {mounted ? dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" /> : <span className="size-4" aria-hidden="true" />}
      </TooltipTrigger>
      <TooltipContent>{mounted ? label : "Tema"}</TooltipContent>
    </Tooltip>
  );
}
