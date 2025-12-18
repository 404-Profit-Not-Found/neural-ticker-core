import * as React from "react"
import { cn } from "../../lib/utils"

interface RadioGroupContextType {
    value?: string;
    onValueChange?: (value: string) => void;
}

const RadioGroupContext = React.createContext<RadioGroupContextType | undefined>(undefined);

const RadioGroup = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { value?: string, onValueChange?: (value: string) => void }
>(({ className, value, onValueChange, children, ...props }, ref) => {
    return (
        <RadioGroupContext.Provider value={{ value, onValueChange }}>
            <div
                className={cn("grid gap-2", className)}
                {...props}
                ref={ref}
            >
                {children}
            </div>
        </RadioGroupContext.Provider>
    )
})
RadioGroup.displayName = "RadioGroup"

const RadioGroupItem = React.forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }
>(({ className, value, onClick, ...props }, ref) => {
    const context = React.useContext(RadioGroupContext);
    const isActive = context?.value === value;

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        context?.onValueChange?.(value);
        onClick?.(e);
    }

    return (
        <button
            type="button"
            role="radio"
            aria-checked={isActive}
            data-state={isActive ? "checked" : "unchecked"}
            className={cn(
                "aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                className
            )}
            onClick={handleClick}
            {...props}
            ref={ref}
        />
    )
})
RadioGroupItem.displayName = "RadioGroupItem"

export { RadioGroup, RadioGroupItem }
