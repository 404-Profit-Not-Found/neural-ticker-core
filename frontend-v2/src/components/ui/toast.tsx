import { useEffect, useMemo, useState } from 'react';
import { Toaster, toast } from 'sonner';

type ToastType = 'success' | 'error' | 'info';

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
}

// One notification system for the whole app. Components historically used
// either this module's `useToast()` or sonner's `toast` directly; both now
// land in the single <AppToaster /> mounted at the root, so a toast raised on
// any page is always visible.
const api: ToastContextType = {
    showToast: (message, type = 'info') => {
        toast[type](message);
    },
};

/** Kept for call-site and test compatibility — the provider holds no state. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextType {
    return api;
}

function readTheme(): 'light' | 'dark' {
    const t = document.documentElement.getAttribute('data-theme');
    return t === 'light' || t === 'gray' ? 'light' : 'dark';
}

/**
 * The app's single toast outlet. Follows the active theme and, on phones,
 * sits above the bottom tab bar instead of underneath it.
 */
export function AppToaster() {
    const [theme, setTheme] = useState<'light' | 'dark'>(readTheme);

    useEffect(() => {
        const observer = new MutationObserver(() => setTheme(readTheme()));
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme'],
        });
        return () => observer.disconnect();
    }, []);

    const mobileOffset = useMemo(
        () => ({ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }),
        [],
    );

    return (
        <Toaster
            theme={theme}
            position="bottom-right"
            richColors
            closeButton
            duration={4000}
            mobileOffset={mobileOffset}
            toastOptions={{ classNames: { toast: 'font-sans' } }}
        />
    );
}
