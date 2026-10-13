import { cn } from "../../lib/api"

/**
 * Loading placeholder. The highlight sweeps across in visible steps rather
 * than a smooth gradient — the terminal's way of saying "working".
 * Honours prefers-reduced-motion (falls back to a static block).
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-md bg-muted bg-[length:200%_100%] bg-no-repeat motion-safe:animate-[skeleton-steps_1.4s_steps(12,end)_infinite]",
        "bg-[linear-gradient(90deg,transparent_0%,rgb(var(--foreground)/0.07)_45%,rgb(var(--foreground)/0.12)_50%,rgb(var(--foreground)/0.07)_55%,transparent_100%)]",
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
