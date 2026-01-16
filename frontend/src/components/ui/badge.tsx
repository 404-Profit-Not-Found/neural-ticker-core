import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/api"

const badgeVariants = cva(
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
    {
        variants: {
            variant: {
                default:
                    "border-transparent bg-primary text-primary-foreground hover:bg-primary/80 [data-theme=light]&:text-black [data-theme=gray]&:text-black",
                secondary:
                    "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 [data-theme=light]&:text-black [data-theme=gray]&:text-black",
                destructive:
                    "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80 [data-theme=light]&:text-black [data-theme=gray]&:text-black",
                outline: "text-foreground [data-theme=light]&:text-black [data-theme=gray]&:text-black",
                // Custom variants for Rating
                strongBuy: "border-transparent bg-green-500/20 text-green-400 hover:bg-green-500/30 badge-light-strong",
                buy: "border-transparent bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 badge-light-buy",
                hold: "border-transparent bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 badge-light-hold",
                purple: "border-transparent bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 badge-light-purple",
                speculativeBuy: "border-transparent bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 badge-light-purple",
                // Colors: Smashed Pumpkin (#FF6C33) - Solid as requested
                legendary: "border-transparent bg-[#FF6C33] text-white hover:bg-[#FF6C33]/90 ring-1 ring-[#FF6C33]/50 shadow-[0_0_12px_rgba(255,108,51,0.4)]",
                sell: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
                success: "border-transparent bg-green-500/20 text-green-400 hover:bg-green-500/30",
                // Admin Console Status Badges (keeping simple to match app style)
                active: "border-emerald-500/50 bg-emerald-500/10 text-emerald-400",
                admin: "border-purple-500/50 bg-purple-500/10 text-purple-400",
                waitlist: "border-amber-500/50 bg-amber-500/10 text-amber-400",
                invited: "border-blue-500/50 bg-blue-500/10 text-blue-400",
                // Tier Badges (not currently used - using inline styling instead)
                tierFree: "border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400",
                tierPro: "border-purple-200 bg-purple-100 text-purple-700 dark:border-purple-500/50 dark:bg-purple-500/10 dark:text-purple-400",
                tierAdmin: "border-red-200 bg-red-100 text-red-700 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-400",
                tierWhale: "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-400",
                // Status Badges (Pastel Solid)
                statusActive: "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-400",
                statusInvited: "border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-500/50 dark:bg-blue-500/10 dark:text-blue-400",
                statusWaitlist: "border-orange-200 bg-orange-100 text-orange-800 dark:border-orange-500/50 dark:bg-orange-500/10 dark:text-orange-400",
                statusBanned: "border-red-200 bg-red-100 text-red-700 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-400", // Same as admin but context differs
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
