import * as React from "react"
import { cn } from "../../lib/utils"

interface TabsContextType {
    value: string;
    onValueChange: (value: string) => void;
    /** Stable prefix linking each tab to its panel for assistive tech. */
    baseId: string;
}

const TabsContext = React.createContext<TabsContextType | undefined>(undefined);

// Tab values are app-defined strings; keep generated ids valid and readable.
const idPart = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-");

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
    const baseId = React.useId();
    const current = value !== undefined ? value : localValue;
    const change = onValueChange || setLocalValue;

    return (
        <TabsContext.Provider value={{ value: current, onValueChange: change, baseId }}>
            <div className={cn("w-full", className)}>{children}</div>
        </TabsContext.Provider>
    );
}

const TabsList = ({ className, children }: { className?: string, children: React.ReactNode }) => {
    // Arrow keys move between tabs (WAI-ARIA tabs pattern); Home/End jump.
    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
        if (!keys.includes(e.key)) return;
        const tabs = Array.from(
            e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'),
        );
        const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
        if (index === -1) return;
        e.preventDefault();
        const next =
            e.key === "Home" ? 0
            : e.key === "End" ? tabs.length - 1
            : e.key === "ArrowRight" ? (index + 1) % tabs.length
            : (index - 1 + tabs.length) % tabs.length;
        tabs[next].focus();
        tabs[next].click();
    };

    return (
        // On narrow screens a row of tabs scrolls sideways inside its own
        // strip instead of pushing the whole page wider than the viewport.
        <div
            role="tablist"
            onKeyDown={onKeyDown}
            className={cn(
                "flex w-full items-center justify-start gap-1 overflow-x-auto overflow-y-hidden bg-transparent p-0 text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                className,
            )}
        >
            {children}
        </div>
    );
}

const TabsTrigger = ({ value, className, children }: { value: string, className?: string, children: React.ReactNode }) => {
    const context = React.useContext(TabsContext);
    if (!context) throw new Error("TabsTrigger must be used within Tabs");

    const isActive = context.value === value;
    const ref = React.useRef<HTMLButtonElement>(null);

    // Keep the selected tab visible when the strip scrolls sideways. Adjusts
    // only the strip's own scrollLeft — never scrollIntoView, which would
    // also scroll the page down to the tabs on load.
    React.useEffect(() => {
        const tab = ref.current;
        const list = tab?.parentElement;
        if (!isActive || !tab || !list || list.scrollWidth <= list.clientWidth) return;
        const left = tab.offsetLeft;
        const right = left + tab.offsetWidth;
        if (left < list.scrollLeft) list.scrollLeft = left;
        else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth;
    }, [isActive]);

    return (
        <button
            ref={ref}
            // type="button": triggers often sit inside a <form>; the default
            // type="submit" made switching tabs submit it (placing a buy /
            // moving cash).
            type="button"
            role="tab"
            id={`${context.baseId}-tab-${idPart(value)}`}
            aria-controls={`${context.baseId}-panel-${idPart(value)}`}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={cn(
                "inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 lg:min-h-9",
                // The current tab is a filled chip — no rule under the strip.
                isActive ? "bg-muted text-foreground" : "hover:bg-muted/50 hover:text-foreground",
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
        <div
            role="tabpanel"
            id={`${context.baseId}-panel-${idPart(value)}`}
            aria-labelledby={`${context.baseId}-tab-${idPart(value)}`}
            className={cn("mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 animate-in fade-in-50 zoom-in-99 duration-200", className)}
        >
            {children}
        </div>
    )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
