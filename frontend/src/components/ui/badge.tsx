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
                sell: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
                success: "border-transparent bg-green-500/20 text-green-400 hover:bg-green-500/30",
                // Admin Console Status Badges (keeping simple to match app style)
                active: "border-emerald-500/50 bg-emerald-500/10 text-emerald-400",
                admin: "border-purple-500/50 bg-purple-500/10 text-purple-400",
                waitlist: "border-amber-500/50 bg-amber-500/10 text-amber-400",
                invited: "border-blue-500/50 bg-blue-500/10 text-blue-400",
                // Tier Badges (not currently used - using inline styling instead)
                tierFree: "border-zinc-600 bg-zinc-800/50 text-zinc-400",
                tierPro: "border-purple-500/50 bg-purple-500/10 text-purple-400",
                tierWhale: "border-amber-500/50 bg-amber-500/10 text-amber-400",
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
