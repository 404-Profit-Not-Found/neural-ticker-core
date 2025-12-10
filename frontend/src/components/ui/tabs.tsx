
import * as React from "react"
import { cn } from "../../lib/utils"

interface TabsContextType {
    value: string;
    onValueChange: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextType | undefined>(undefined);

const Tabs = ({
    defaultValue,
    value,
    onValueChange,
    children,
    className
}: {
    defaultValue?: string,
    value?: string,
    onValueChange?: (v: string) => void,
    children: React.ReactNode,
    className?: string
}) => {
    const [localValue, setLocalValue] = React.useState(defaultValue || "");
    const current = value !== undefined ? value : localValue;
    const change = onValueChange || setLocalValue;

    return (
        <TabsContext.Provider value={{ value: current, onValueChange: change }}>
            <div className={cn("w-full", className)}>{children}</div>
        </TabsContext.Provider>
    );
}

const TabsList = ({ className, children }: { className?: string, children: React.ReactNode }) => (
    <div className={cn("inline-flex h-10 items-center justify-start rounded-none border-b border-border bg-transparent p-0 text-muted-foreground w-full", className)}>
        {children}
    </div>
)

const TabsTrigger = ({ value, className, children }: { value: string, className?: string, children: React.ReactNode }) => {
    const context = React.useContext(TabsContext);
    if (!context) throw new Error("TabsTrigger must be used within Tabs");

    const isActive = context.value === value;

    return (
        <button
            className={cn(
                "inline-flex items-center justify-center whitespace-nowrap py-2 px-4 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                "border-b-2 border-transparent hover:text-foreground/80",
                isActive && "border-primary text-foreground font-bold",
                className
            )}
            onClick={() => context.onValueChange(value)}
        >
            {children}
        </button>
    )
}

const TabsContent = ({ value, className, children }: { value: string, className?: string, children: React.ReactNode }) => {
    const context = React.useContext(TabsContext);
    if (!context) throw new Error("TabsContent must be used within Tabs");

    if (context.value !== value) return null;

    return (
        <div className={cn("mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 animate-in fade-in-50 zoom-in-99 duration-200", className)}>
            {children}
        </div>
    )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
