import * as React from "react"
import { cn } from "../../lib/utils"

interface PageHeaderProps {
    title: React.ReactNode
    /** One line of context under the title. Hidden on phones to save height. */
    description?: React.ReactNode
    /** Small label above the title, e.g. the section the page belongs to. */
    eyebrow?: React.ReactNode
    icon?: React.ReactNode
    /** A way back, above the title — for pages outside the main navigation. */
    back?: React.ReactNode
    /** Primary page actions, right-aligned (wrap under the title on phones). */
    actions?: React.ReactNode
    className?: string
}

/**
 * The one page-title pattern for the app: same size, weight and spacing on
 * every screen, so navigating never feels like changing products.
 */
export function PageHeader({ title, description, eyebrow, icon, back, actions, className }: PageHeaderProps) {
    return (
        <header className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-3", className)}>
            <div className="min-w-0">
                {back && <div className="mb-1">{back}</div>}
                {eyebrow && <p className="label-micro mb-1.5">{eyebrow}</p>}
                <h1 className="flex items-center gap-2.5 text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-[1.75rem]">
                    {icon && <span className="shrink-0 text-signal" aria-hidden>{icon}</span>}
                    <span className="truncate">{title}</span>
                </h1>
                {description && (
                    <p className="mt-1 hidden text-sm text-muted-foreground sm:block">{description}</p>
                )}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
    )
}
