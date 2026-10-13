import { cn } from "../../lib/api"

/**
 * Loading placeholder: a quiet tonal block with one soft highlight gliding
 * across it. The highlight is a pseudo-element moved with a transform, so it
 * is smooth and cheap however many placeholders are on screen.
 * Honours prefers-reduced-motion (falls back to a static block).
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-md bg-muted/80",
        "after:absolute after:inset-0 after:-translate-x-full after:content-['']",
        "after:bg-[linear-gradient(90deg,transparent,rgb(var(--foreground)/0.07)_50%,transparent)]",
        "motion-safe:after:animate-[skeleton-sweep_1.6s_ease-in-out_infinite]",
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
