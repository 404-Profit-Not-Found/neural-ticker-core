
import * as React from "react"
import { cn } from "../../lib/utils"
import { ChevronDown } from "lucide-react"

export type NativeSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
    ({ className, children, ...props }, ref) => {
        return (
            <div className="relative">
                <select
                    className={cn(
                        "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 appearance-none",
                        className
                    )}
                    ref={ref}
                    {...props}
                >
                    {children}
                </select>
                <ChevronDown className="absolute right-3 top-3 h-4 w-4 opacity-50 pointer-events-none" />
            </div>
        )
    }
)
NativeSelect.displayName = "NativeSelect"

export { NativeSelect }
