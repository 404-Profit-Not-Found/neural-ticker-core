import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"
import { CheckCircle2, AlertOctagon, Info, AlertTriangle } from "lucide-react"

const alertVariants = cva(
    "rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-2",
    {
        variants: {
            variant: {
                success: "bg-emerald-500/15 text-emerald-200 [data-theme='light']:bg-emerald-100 [data-theme='light']:text-emerald-800 [data-theme='gray']:bg-emerald-100 [data-theme='gray']:text-emerald-800",
                error: "bg-red-500/15 text-red-200 [data-theme='light']:bg-red-100 [data-theme='light']:text-red-800 [data-theme='gray']:bg-red-100 [data-theme='gray']:text-red-800",
                warning: "bg-yellow-500/15 text-yellow-200 [data-theme='light']:bg-yellow-100 [data-theme='light']:text-yellow-800 [data-theme='gray']:bg-yellow-100 [data-theme='gray']:text-yellow-800",
                info: "bg-blue-500/15 text-blue-200 [data-theme='light']:bg-blue-100 [data-theme='light']:text-blue-800 [data-theme='gray']:bg-blue-100 [data-theme='gray']:text-blue-800",
            },
        },
        defaultVariants: {
            variant: "info",
        },
    }
)

const iconMap = {
    success: CheckCircle2,
    error: AlertOctagon,
    warning: AlertTriangle,
    info: Info,
}

export interface InlineAlertProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
    icon?: boolean
}

function InlineAlert({ className, variant = "info", icon = true, children, ...props }: InlineAlertProps) {
    const IconComponent = iconMap[variant || "info"]

    return (
        <div
            role={variant === "error" ? "alert" : "status"}
            className={cn(alertVariants({ variant }), className)}
            {...props}
        >
            {icon && <IconComponent aria-hidden className={cn("w-4 h-4 shrink-0",
                variant === 'success' && "text-emerald-400 [data-theme='light']:text-emerald-600 [data-theme='gray']:text-emerald-600",
                variant === 'error' && "text-red-400 [data-theme='light']:text-red-600 [data-theme='gray']:text-red-600",
                variant === 'warning' && "text-yellow-400 [data-theme='light']:text-yellow-600 [data-theme='gray']:text-yellow-600",
                variant === 'info' && "text-blue-400 [data-theme='light']:text-blue-600 [data-theme='gray']:text-blue-600"
            )} />}
            <div className="min-w-0 break-words">{children}</div>
        </div>
    )
}

export { InlineAlert }
