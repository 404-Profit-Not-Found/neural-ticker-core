import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"
import { CheckCircle2, Activity, Info, AlertTriangle } from "lucide-react"

const alertVariants = cva(
    "rounded-lg border px-3 py-2 text-sm font-semibold flex items-center gap-2",
    {
        variants: {
            variant: {
                success: "border-emerald-500/30 bg-emerald-500/15 text-emerald-200 [data-theme='light']:bg-emerald-100 [data-theme='light']:border-emerald-200 [data-theme='light']:text-emerald-800",
                error: "border-red-500/30 bg-red-500/15 text-red-200 [data-theme='light']:bg-red-100 [data-theme='light']:border-red-200 [data-theme='light']:text-red-800",
                warning: "border-yellow-500/30 bg-yellow-500/15 text-yellow-200 [data-theme='light']:bg-yellow-100 [data-theme='light']:border-yellow-200 [data-theme='light']:text-yellow-800",
                info: "border-blue-500/30 bg-blue-500/15 text-blue-200 [data-theme='light']:bg-blue-100 [data-theme='light']:border-blue-200 [data-theme='light']:text-blue-800",
            },
        },
        defaultVariants: {
            variant: "info",
        },
    }
)

const iconMap = {
    success: CheckCircle2,
    error: Activity,
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
        <div className={cn(alertVariants({ variant }), className)} {...props}>
            {icon && <IconComponent className={cn("w-4 h-4",
                variant === 'success' && "text-emerald-600 [data-theme='light']:text-emerald-600",
                variant === 'error' && "text-red-600 [data-theme='light']:text-red-600",
                variant === 'warning' && "text-yellow-600 [data-theme='light']:text-yellow-600",
                variant === 'info' && "text-blue-600 [data-theme='light']:text-blue-600"
            )} />}
            <div>{children}</div>
        </div>
    )
}

export { InlineAlert }
