import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/api"

const badgeVariants = cva(
    "inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-[4px] px-1.5 font-mono text-[11px] font-semibold uppercase leading-none tracking-[0.06em] transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    {
        variants: {
            variant: {
                default:
                    "bg-primary text-primary-foreground hover:bg-primary/80 [data-theme=light]&:text-black [data-theme=gray]&:text-black",
                secondary:
                    "bg-secondary text-secondary-foreground hover:bg-secondary/80 [data-theme=light]&:text-black [data-theme=gray]&:text-black",
                destructive:
                    "bg-destructive text-destructive-foreground hover:bg-destructive/80 [data-theme=light]&:text-black [data-theme=gray]&:text-black",
                outline: "bg-muted text-foreground [data-theme=light]&:text-black [data-theme=gray]&:text-black",
                // Custom variants for Rating
                strongBuy: "bg-green-500/15 text-green-400 hover:bg-green-500/25 badge-light-strong",
                buy: "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 badge-light-buy",
                hold: "bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 badge-light-hold",
                purple: "bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 badge-light-purple",
                speculativeBuy: "bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 badge-light-purple",
                // Colors: Smashed Pumpkin (#FF6C33) - Solid as requested
                legendary: "bg-[#FF6C33] text-white hover:bg-[#FF6C33]/90 ring-1 ring-[#FF6C33]/50 shadow-[0_0_12px_rgba(255,108,51,0.4)]",
                sell: "bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 badge-light-sell",
                success: "bg-green-500/15 text-green-400 hover:bg-green-500/25",
                // Admin Console Status Badges (keeping simple to match app style)
                active: "bg-emerald-500/10 text-emerald-400",
                admin: "bg-purple-500/10 text-purple-400",
                waitlist: "bg-amber-500/10 text-amber-400",
                invited: "bg-blue-500/10 text-blue-400",
                // Tier Badges (not currently used - using inline styling instead)
                tierFree: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400",
                tierPro: "bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400",
                tierAdmin: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
                tierWhale: "bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400",
                // Status Badges (Pastel Solid)
                statusActive: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
                statusInvited: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
                statusWaitlist: "bg-orange-100 text-orange-800 dark:bg-orange-500/10 dark:text-orange-400",
                statusBanned: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400", // Same as admin but context differs
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
)

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
    return (
        <div className={cn(badgeVariants({ variant }), className)} {...props} />
    )
}

// eslint-disable-next-line react-refresh/only-export-components
export { Badge, badgeVariants }
