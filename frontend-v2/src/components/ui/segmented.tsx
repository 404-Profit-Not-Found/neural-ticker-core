import * as React from "react"
import { cn } from "../../lib/utils"

export interface SegmentedOption<T extends string> {
    value: T
    label: React.ReactNode
    /** Accessible name when the label is an icon. */
    ariaLabel?: string
    disabled?: boolean
}

interface SegmentedControlProps<T extends string> {
    value: T
    onChange: (value: T) => void
    options: ReadonlyArray<SegmentedOption<T>>
    /** Names the group for assistive tech, e.g. "Chart range". */
    label: string
    size?: "sm" | "md"
    /** Stretch to the container and give every option equal width. */
    fill?: boolean
    className?: string
}

/**
 * One-of-many switch (range pickers, view toggles, category filters).
 * A real radio group: arrow keys move the selection, one tab stop, and the
 * selected option is a lighter chip in a tonal well — no outlines.
 */
export function SegmentedControl<T extends string>({
    value,
    onChange,
    options,
    label,
    size = "md",
    fill,
    className,
}: SegmentedControlProps<T>) {
    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
        if (dir === 0) return
        e.preventDefault()
        const enabled = options.filter((o) => !o.disabled)
        const index = enabled.findIndex((o) => o.value === value)
        const next = enabled[(index + dir + enabled.length) % enabled.length]
        if (!next) return
        onChange(next.value)
        // Move focus with the selection (roving tabindex).
        const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not([disabled])')
        buttons[(index + dir + enabled.length) % enabled.length]?.focus()
    }

    return (
        <div
            role="radiogroup"
            aria-label={label}
            onKeyDown={onKeyDown}
            className={cn(
                "inline-flex items-stretch rounded-md bg-muted/70 p-0.5",
                fill && "flex w-full",
                className,
            )}
        >
            {options.map((option) => {
                const selected = option.value === value
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={option.ariaLabel}
                        disabled={option.disabled}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[4px] font-sans font-medium leading-none transition-colors duration-150",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
                            // Comfortable on touch, compact with a mouse.
                            size === "sm" ? "min-h-10 min-w-10 px-3 text-[13px] lg:min-h-7 lg:min-w-0 lg:px-2.5 lg:text-xs" : "min-h-10 min-w-10 px-3.5 text-sm lg:min-h-8 lg:min-w-0 lg:px-3 lg:text-[13px]",
                            fill && "flex-1",
                            selected
                                ? "bg-raised text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {option.label}
                    </button>
                )
            })}
        </div>
    )
}
