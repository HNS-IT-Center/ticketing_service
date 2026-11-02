import * as React from "react"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * A plain <select>, styled like Input. Kept native on purpose: on an Android
 * phone it opens the system picker, which beats any custom dropdown there, and
 * it submits with a form like any other field.
 *
 * `className` goes on the wrapper (layout: width, flex); the select fills it.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div data-slot="native-select-wrapper" className={cn("relative w-full min-w-0", className)}>
      <select
        data-slot="native-select"
        className="h-11 w-full min-w-0 appearance-none rounded-lg border border-input bg-card py-1 pr-9 pl-3 text-base text-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:h-9 md:text-sm"
        {...props}
      />
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export { NativeSelect }
