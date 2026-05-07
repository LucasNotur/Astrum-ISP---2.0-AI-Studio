import * as React from "react"

import { cn } from "@/src/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full rounded-full border-none bg-zinc-100 dark:bg-zinc-800/50 px-5 py-2 text-base shadow-sm backdrop-blur-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:bg-zinc-200/50 dark:focus-visible:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm placeholder:text-zinc-400 font-medium",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
