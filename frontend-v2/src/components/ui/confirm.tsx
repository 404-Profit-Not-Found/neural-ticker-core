import {
    createContext,
    useCallback,
    useContext,
    useId,
    useMemo,
    useRef,
    useState,
    type FormEvent,
    type ReactNode,
} from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './button';
import {
    Dialog,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from './dialog';
import { Input } from './input';
import { Label } from './label';

export interface ConfirmOptions {
    title: string;
    description?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Styles the confirm button as destructive (delete, revoke, reset…). */
    destructive?: boolean;
}

export interface PromptOptions {
    title: string;
    description?: ReactNode;
    /** Visible label for the field. */
    label: string;
    defaultValue?: string;
    placeholder?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    inputMode?: 'text' | 'numeric' | 'decimal';
    maxLength?: number;
    /** Return an error message to block submission, or null when valid. */
    validate?: (value: string) => string | null;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
type PromptFn = (options: PromptOptions) => Promise<string | null>;

type Request =
    | { kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
    | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void };

const DialogsContext = createContext<{ confirm: ConfirmFn; prompt: PromptFn } | null>(null);

function cancel(request: Request): void {
    if (request.kind === 'confirm') request.resolve(false);
    else request.resolve(null);
}

/**
 * In-app replacements for `window.confirm()` and `window.prompt()`: the same
 * promise-style calls (`if (!(await confirm({...}))) return;`), rendered as
 * themed, keyboard- and screen-reader-friendly dialogs instead of the
 * browser's native popups.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [request, setRequest] = useState<Request | null>(null);
    const current = useRef<Request | null>(null);

    const open = useCallback((next: Request) => {
        // A second request while one is open cancels the first.
        if (current.current) cancel(current.current);
        current.current = next;
        setRequest(next);
    }, []);

    const close = useCallback(() => {
        current.current = null;
        setRequest(null);
    }, []);

    const api = useMemo(
        () => ({
            confirm: ((options) =>
                new Promise<boolean>((resolve) => open({ kind: 'confirm', options, resolve }))) as ConfirmFn,
            prompt: ((options) =>
                new Promise<string | null>((resolve) => open({ kind: 'prompt', options, resolve }))) as PromptFn,
        }),
        [open],
    );

    const dismiss = (): void => {
        if (request) cancel(request);
        close();
    };

    return (
        <DialogsContext.Provider value={api}>
            {children}
            <Dialog
                open={request !== null}
                onOpenChange={(isOpen) => {
                    if (!isOpen) dismiss();
                }}
                className="max-w-md"
            >
                {request?.kind === 'confirm' && (
                    <ConfirmBody
                        options={request.options}
                        onCancel={dismiss}
                        onConfirm={() => {
                            request.resolve(true);
                            close();
                        }}
                    />
                )}
                {request?.kind === 'prompt' && (
                    <PromptBody
                        options={request.options}
                        onCancel={dismiss}
                        onSubmit={(value) => {
                            request.resolve(value);
                            close();
                        }}
                    />
                )}
            </Dialog>
        </DialogsContext.Provider>
    );
}

function ConfirmBody({
    options,
    onCancel,
    onConfirm,
}: {
    options: ConfirmOptions;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <>
            <DialogHeader className="text-left sm:text-left">
                <div className="flex items-start gap-3 pr-8">
                    {options.destructive && (
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                            <AlertTriangle className="h-4 w-4" aria-hidden />
                        </span>
                    )}
                    <div className="space-y-1.5">
                        <DialogTitle className="leading-snug">{options.title}</DialogTitle>
                        {options.description && (
                            <DialogDescription className="leading-relaxed">
                                {options.description}
                            </DialogDescription>
                        )}
                    </div>
                </div>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:space-x-0">
                {/* For destructive actions the safe choice takes initial focus, so a
                    stray Enter can never delete something. */}
                <Button variant="outline" autoFocus={!!options.destructive} onClick={onCancel}>
                    {options.cancelLabel ?? 'Cancel'}
                </Button>
                <Button
                    autoFocus={!options.destructive}
                    onClick={onConfirm}
                    className={
                        options.destructive ? 'bg-red-600 text-white hover:bg-red-600/90' : undefined
                    }
                >
                    {options.confirmLabel ?? 'Confirm'}
                </Button>
            </DialogFooter>
        </>
    );
}

function PromptBody({
    options,
    onCancel,
    onSubmit,
}: {
    options: PromptOptions;
    onCancel: () => void;
    onSubmit: (value: string) => void;
}) {
    const [value, setValue] = useState(options.defaultValue ?? '');
    const [error, setError] = useState<string | null>(null);
    const fieldId = useId();
    const errorId = `${fieldId}-error`;

    const submit = (e: FormEvent): void => {
        e.preventDefault();
        const trimmed = value.trim();
        const problem = trimmed.length === 0 ? 'This field is required.' : (options.validate?.(trimmed) ?? null);
        if (problem) {
            setError(problem);
            return;
        }
        onSubmit(trimmed);
    };

    return (
        <form onSubmit={submit} noValidate>
            <DialogHeader className="text-left sm:text-left">
                <div className="space-y-1.5 pr-8">
                    <DialogTitle className="leading-snug">{options.title}</DialogTitle>
                    {options.description && (
                        <DialogDescription className="leading-relaxed">
                            {options.description}
                        </DialogDescription>
                    )}
                </div>
            </DialogHeader>

            <div className="space-y-2 pb-5">
                <Label htmlFor={fieldId}>{options.label}</Label>
                <Input
                    id={fieldId}
                    autoFocus
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value);
                        if (error) setError(null);
                    }}
                    onFocus={(e) => e.currentTarget.select()}
                    placeholder={options.placeholder}
                    inputMode={options.inputMode}
                    maxLength={options.maxLength}
                    autoComplete="off"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                />
                {error && (
                    <p id={errorId} role="alert" className="text-xs text-red-500">
                        {error}
                    </p>
                )}
            </div>

            <DialogFooter className="gap-2 sm:space-x-0">
                <Button type="button" variant="outline" onClick={onCancel}>
                    {options.cancelLabel ?? 'Cancel'}
                </Button>
                <Button type="submit">{options.confirmLabel ?? 'Save'}</Button>
            </DialogFooter>
        </form>
    );
}

function useDialogs() {
    const ctx = useContext(DialogsContext);
    if (!ctx) throw new Error('useConfirm/usePrompt must be used within a ConfirmProvider');
    return ctx;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm(): ConfirmFn {
    return useDialogs().confirm;
}

/** Resolves with the trimmed text, or null if the user cancelled. */
// eslint-disable-next-line react-refresh/only-export-components
export function usePrompt(): PromptFn {
    return useDialogs().prompt;
}
