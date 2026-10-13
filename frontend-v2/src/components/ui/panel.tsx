import * as React from "react"
import { cn } from "../../lib/utils"

type LedTone = "signal" | "up" | "down" | "info" | "ai" | "off"

const LED_CLASS: Record<LedTone, string> = {
    signal: "led",
    up: "led led-up",
    down: "led led-down",
    info: "led led-info",
    ai: "led led-ai",
    off: "led led-off",
}

/** Square status light. Decorative unless given a label. */
function Led({ tone = "signal", pulse, className, label }: { tone?: LedTone; pulse?: boolean; className?: string; label?: string }) {
    return (
        <span
            className={cn(LED_CLASS[tone], pulse && "led-pulse", className)}
            role={label ? "img" : undefined}
            aria-label={label}
            aria-hidden={label ? undefined : true}
        />
    )
}

/**
 * Panel — one tonal surface, optionally with a title row. Use it for every
 * self-contained block on a page (a list, a chart, a form section). It has no
 * outline and no rule under its title: tone and spacing separate things.
 */
const Panel = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "aside" | "article" }>(
    ({ as: Tag = "section", className, ...props }, ref) => (
        <Tag
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ref={ref as any}
            className={cn("panel flex min-w-0 flex-col", className)}
            {...props}
        />
    ),
)
Panel.displayName = "Panel"

interface PanelHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
    /** Short title, rendered as small uppercase mono. */
    title: React.ReactNode
    /** Status light before the title. Pass `null` to omit it. */
    led?: LedTone | null
    /** Animate the light while the panel's data is live/working. */
    pulse?: boolean
    /** Optional icon instead of / before the title text. */
    icon?: React.ReactNode
    /** Right-aligned controls: segmented control, links, counters. */
    actions?: React.ReactNode
    /** Heading level for the document outline. */
    level?: 2 | 3 | 4
    /**
     * On phones, put the actions on their own full-width row under the title
     * (for controls too wide to share a 390px line with it).
     */
    stackActions?: boolean
}

function PanelHeader({ title, led = "signal", pulse, icon, actions, level = 2, stackActions, className, ...props }: PanelHeaderProps) {
    const Heading = `h${level}` as "h2"
    return (
        <div
            className={cn(
                "panel-head",
                stackActions && "flex-col items-stretch gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-3 sm:py-0",
                className,
            )}
            {...props}
        >
            <Heading className="panel-title">
                {led !== null && <Led tone={led} pulse={pulse} />}
                {icon}
                <span className="truncate">{title}</span>
            </Heading>
            {actions && (
                <div className={cn("flex min-w-0 items-center gap-2", stackActions ? "sm:shrink-0" : "shrink-0")}>
                    {actions}
                </div>
            )}
        </div>
    )
}

function PanelBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn("panel-body min-w-0 flex-1 p-4", className)} {...props} />
}

/** Bottom row for totals, pagination, or a "view all" link. */
function PanelFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn("flex items-center justify-between gap-3 px-4 pb-3.5 pt-1 text-xs text-muted-foreground", className)}
            {...props}
        />
    )
}

export { Panel, PanelHeader, PanelBody, PanelFooter, Led }
export type { LedTone }
