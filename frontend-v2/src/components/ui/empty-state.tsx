import * as React from "react"
import { CloudOff } from "lucide-react"
import { cn } from "../../lib/utils"
import { Button } from "./button"

interface EmptyStateProps {
    icon?: React.ReactNode
    title: string
    description?: React.ReactNode
    /** A button or link that resolves the emptiness. */
    action?: React.ReactNode
    /** Use `alert` for load failures so they are announced. */
    role?: "status" | "alert"
    /**
     * `error` for "we could not load this" — a different thing from "there is
     * nothing here", and it must not look the same.
     */
    tone?: "neutral" | "error"
    className?: string
}

/** Consistent "nothing here" / "couldn't load" block for lists and panels. */
export function EmptyState({ icon, title, description, action, role, tone = "neutral", className }: EmptyStateProps) {
    return (
        <div
            role={role ?? (tone === "error" ? "alert" : "status")}
            className={cn("flex flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}
        >
            {icon && (
                <span
                    className={cn(
                        "mb-1 flex h-10 w-10 items-center justify-center rounded-md",
                        tone === "error" ? "bg-down/10 text-down" : "bg-muted text-muted-foreground",
                    )}
                    aria-hidden
                >
                    {icon}
                </span>
            )}
            <p className="text-sm font-semibold text-foreground">{title}</p>
            {description && <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>}
            {action && <div className="mt-2">{action}</div>}
        </div>
    )
}

/** The standard "this failed to load" block: says so, keeps context, offers a retry. */
export function LoadError({ what, onRetry, className }: { what: string; onRetry?: () => void; className?: string }) {
    return (
        <EmptyState
            tone="error"
            className={className}
            icon={<CloudOff className="h-5 w-5" />}
            title={`Couldn't load ${what}`}
            description="The server didn't answer. Nothing was changed."
            action={onRetry ? <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button> : undefined}
        />
    )
}
