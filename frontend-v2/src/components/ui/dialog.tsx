import * as React from "react"
import { X } from "lucide-react"
import { cn } from "../../lib/utils"

import { createPortal } from "react-dom"

// Dialog built on a portal, with the modal behaviour assistive tech and
// keyboard users rely on: focus moves in and is trapped, Escape closes the
// topmost dialog, the page behind does not scroll, and focus returns to the
// control that opened it.

const TitleIdContext = React.createContext<string | undefined>(undefined)

// Dialogs can stack (e.g. "Deposit cash" over "Add position"): only the
// topmost one reacts to Escape, and the page stays locked until all close.
const openStack: string[] = []
let lockedOverflow: string | null = null

function lockScroll() {
    if (lockedOverflow === null) {
        lockedOverflow = document.body.style.overflow
        document.body.style.overflow = "hidden"
    }
}

function unlockScroll() {
    if (openStack.length === 0 && lockedOverflow !== null) {
        document.body.style.overflow = lockedOverflow
        lockedOverflow = null
    }
}

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

type DialogProps = React.HTMLAttributes<HTMLDivElement> & {
    open?: boolean
    onOpenChange?: (open: boolean) => void
    /** Classes for the full-viewport container (alignment / outer padding). */
    containerClassName?: string
    /** Omit the built-in corner close button (the content provides its own). */
    hideClose?: boolean
}

const DialogSurface = React.forwardRef<HTMLDivElement, DialogProps>(
    ({ className, children, onOpenChange, containerClassName, hideClose, ...props }, ref) => {
        const id = React.useId()
        const titleId = `${id}-title`
        const panelRef = React.useRef<HTMLDivElement | null>(null)
        const onOpenChangeRef = React.useRef(onOpenChange)
        React.useEffect(() => {
            onOpenChangeRef.current = onOpenChange
        })

        React.useEffect(() => {
            const opener = document.activeElement as HTMLElement | null
            openStack.push(id)
            lockScroll()

            // Respect an autofocused field inside the dialog; otherwise focus
            // the panel itself so the next Tab lands on its first control.
            const panel = panelRef.current
            if (panel && !panel.contains(document.activeElement)) {
                panel.focus({ preventScroll: true })
            }

            const onKeyDown = (e: KeyboardEvent) => {
                if (openStack[openStack.length - 1] !== id) return
                if (e.key === "Escape") {
                    e.stopPropagation()
                    onOpenChangeRef.current?.(false)
                    return
                }
                if (e.key !== "Tab" || !panel) return
                const items = Array.from(
                    panel.querySelectorAll<HTMLElement>(FOCUSABLE),
                ).filter((el) => el.offsetParent !== null)
                if (items.length === 0) {
                    e.preventDefault()
                    return
                }
                const first = items[0]
                const last = items[items.length - 1]
                const active = document.activeElement
                if (!panel.contains(active)) {
                    // Focus is in a portalled child (popover, calendar): leave it be.
                    return
                }
                if (e.shiftKey && (active === first || active === panel)) {
                    e.preventDefault()
                    last.focus()
                } else if (!e.shiftKey && active === last) {
                    e.preventDefault()
                    first.focus()
                }
            }
            document.addEventListener("keydown", onKeyDown)

            return () => {
                document.removeEventListener("keydown", onKeyDown)
                const i = openStack.lastIndexOf(id)
                if (i !== -1) openStack.splice(i, 1)
                unlockScroll()
                if (opener && document.contains(opener)) {
                    opener.focus({ preventScroll: true })
                }
            }
        }, [id])

        const setRefs = (node: HTMLDivElement | null) => {
            panelRef.current = node
            if (typeof ref === "function") ref(node)
            else if (ref) ref.current = node
        }

        return createPortal(
            <div
                // Phones: a bottom sheet (thumb reach, full width, room for the
                // keyboard). From `sm` up: a centred card.
                // The top gap (phones) and the margins (desktop) live on the container
                // and the panel is simply `max-h-full`: standard classes that a
                // caller's `p-0` / `max-h-none` reliably replace via tailwind-merge.
                className={cn("fixed inset-0 z-[9999] flex items-end justify-center px-0 pb-0 pt-10 sm:items-center sm:p-6", containerClassName)}
                {...props}
            >
                <div
                    className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-all duration-100"
                    onClick={() => onOpenChange?.(false)}
                    aria-hidden="true"
                />
                <div
                    ref={setRefs}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                    tabIndex={-1}
                    className={cn(
                        // Mobile-first on purpose (no `max-sm:`): callers that pass
                        // unprefixed overrides (`max-h-none`, `rounded-none`, `p-0`)
                        // still win through tailwind-merge.
                        "relative w-full max-w-lg max-h-full overflow-y-auto overscroll-contain rounded-t-lg rounded-b-none bg-popover p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-left text-foreground shadow-2xl shadow-black/60 outline-none animate-in slide-in-from-bottom-10 sm:rounded-lg sm:slide-in-from-bottom-0 sm:zoom-in-95",
                        className
                    )}
                >
                    <TitleIdContext.Provider value={titleId}>
                        {children}
                    </TitleIdContext.Provider>
                    {!hideClose && (
                        <button
                            type="button"
                            onClick={() => onOpenChange?.(false)}
                            className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-md opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none"
                        >
                            <X className="h-4 w-4" />
                            <span className="sr-only">Close</span>
                        </button>
                    )}
                </div>
            </div>,
            document.body
        )
    },
)
DialogSurface.displayName = "DialogSurface"

const Dialog = React.forwardRef<HTMLDivElement, DialogProps>(
    ({ open, ...props }, ref) => {
        // Unmounted while closed, so every open starts from a clean state.
        if (!open) return null
        return <DialogSurface ref={ref} {...props} />
    },
)
Dialog.displayName = "Dialog"

const DialogHeader = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        // Left-aligned at every width: titles carry icons and sit next to the
        // close button, so centring only the description looked accidental.
        className={cn("flex flex-col space-y-1.5 pr-8 text-left mb-4", className)}
        {...props}
    />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
    className,
    sticky,
    ...props
}: React.HTMLAttributes<HTMLDivElement> & {
    /**
     * Keep the actions visible while a long dialog body scrolls (the dialog
     * panel is the scroll container). Use for forms taller than a phone.
     */
    sticky?: boolean
}) => (
    <div
        className={cn(
            // Stacked buttons on phones need a gap too, not only the row layout.
            "flex flex-col-reverse max-sm:gap-2 sm:flex-row sm:justify-end sm:space-x-2",
            // 44px actions on phones, whatever size the caller's buttons are.
            "max-sm:[&>button]:min-h-11",
            // Phones: the actions stay pinned to the bottom of the sheet while
            // the body scrolls, so the primary action is always reachable. A
            // short fade (not a rule) tells the user content continues under it.
            // (Sticky offsets are measured from the content edge, hence the
            // negative bottom equal to the panel's own bottom padding.)
            "max-sm:sticky max-sm:bottom-[calc(max(1.5rem,env(safe-area-inset-bottom))*-1)] max-sm:z-10 max-sm:-mx-6 max-sm:mt-4 max-sm:mb-[calc(max(1.5rem,env(safe-area-inset-bottom))*-1)] max-sm:bg-popover max-sm:px-6 max-sm:pt-3 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]",
            "max-sm:before:pointer-events-none max-sm:before:absolute max-sm:before:inset-x-0 max-sm:before:-top-4 max-sm:before:h-4 max-sm:before:bg-gradient-to-t max-sm:before:from-popover max-sm:before:to-transparent max-sm:before:content-['']",
            // -bottom-6: sticky offsets start at the content edge; the panel has p-6.
            sticky && "sticky -bottom-6 z-10 -mx-6 -mb-6 mt-4 bg-popover px-6 py-3 shadow-[0_-12px_16px_-12px_rgb(0_0_0/0.5)]",
            className
        )}
        {...props}
    />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
    HTMLHeadingElement,
    React.HTMLAttributes<HTMLHeadingElement>
>(({ className, id, ...props }, ref) => {
    // Names the surrounding dialog for screen readers (aria-labelledby).
    const titleId = React.useContext(TitleIdContext)
    return (
        <h3
            ref={ref}
            id={id ?? titleId}
            className={cn(
                "text-lg font-semibold leading-none tracking-tight",
                className
            )}
            {...props}
        />
    )
})
DialogTitle.displayName = "DialogTitle"

const DialogDescription = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
    <p
        ref={ref}
        className={cn("text-sm text-muted-foreground", className)}
        {...props}
    />
))
DialogDescription.displayName = "DialogDescription"

// Shim for APIs used by other components
const DialogContent = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={className} {...props}>{children}</div>
const DialogTrigger = ({ children }: { children: React.ReactNode }) => <>{children}</>

export { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogTrigger }
