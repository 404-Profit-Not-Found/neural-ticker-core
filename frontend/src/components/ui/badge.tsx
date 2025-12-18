import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/api"

const badgeVariants = cva(
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
    {
        variants: {
            variant: {
                default:
                    "border-transparent bg-primary text-primary-foreground hover:bg-primary/80 [data-theme=light]&:text-black",
                secondary:
                    "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 [data-theme=light]&:text-black",
                destructive:
                    "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80 [data-theme=light]&:text-black",
                outline: "text-foreground [data-theme=light]&:text-black",
                // Custom variants for Rating
                strongBuy: "border-transparent bg-green-500/20 text-green-400 hover:bg-green-500/30 badge-light-strong",
                buy: "border-transparent bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 badge-light-buy",
                hold: "border-transparent bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 badge-light-hold",
                purple: "border-transparent bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 badge-light-purple",
                speculativeBuy: "border-transparent bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 badge-light-purple",
                sell: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
                success: "border-transparent bg-green-500/20 text-green-400 hover:bg-green-500/30",
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
