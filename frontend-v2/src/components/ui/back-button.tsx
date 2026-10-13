import { ArrowLeft } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"
import { cn } from "../../lib/utils"

interface BackButtonProps {
    /** Where to go when there is nothing to go back to (deep link, new tab). */
    fallback?: string
    label?: string
    className?: string
}

/**
 * "Back" for pages that are not in the main navigation (profile, admin):
 * returns to where the user came from, or to `fallback` when the page was
 * opened directly.
 */
export function BackButton({ fallback = "/dashboard", label = "Back", className }: BackButtonProps) {
    const navigate = useNavigate()
    const location = useLocation()
    const goBack = () => (location.key !== "default" ? navigate(-1) : navigate(fallback))

    return (
        <button
            type="button"
            onClick={goBack}
            className={cn(
                "-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-9",
                className,
            )}
        >
            <ArrowLeft className="h-4 w-4" aria-hidden /> {label}
        </button>
    )
}
