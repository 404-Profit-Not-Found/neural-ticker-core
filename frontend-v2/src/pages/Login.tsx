import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';

// The candle motif shared with the boot splash (SuperLoading). Purely
// decorative: it is hidden from assistive tech and carries no data.
const CANDLES = [
    { bottom: 30, height: 35, up: true },
    { bottom: 40, height: 25, up: false },
    { bottom: 45, height: 30, up: true },
    { bottom: 50, height: 15, up: false },
    { bottom: 48, height: 40, up: true },
    { bottom: 70, height: 25, up: true },
    { bottom: 55, height: 35, up: false },
    { bottom: 40, height: 20, up: false },
    { bottom: 42, height: 15, up: true },
    { bottom: 48, height: 45, up: true },
    { bottom: 75, height: 20, up: true },
];

const FOOTER_LINK =
    'inline-flex min-h-11 items-center rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function Login() {
    const { loginWithGoogle } = useAuth();

    return (
        <div className="flex min-h-dvh flex-col bg-background text-foreground">
            <main className="flex flex-1 items-center justify-center px-4 py-10">
                <div className="w-full max-w-sm animate-in fade-in zoom-in-95 duration-500">
                    {/* Brand lockup — the same mark and wordmark as the app header. */}
                    <h1 className="flex items-center justify-center gap-3">
                        <img
                            src={`${import.meta.env.BASE_URL}favicon.svg`}
                            alt=""
                            width={30}
                            height={38}
                            className="h-9 w-auto shrink-0 sm:h-10"
                        />
                        <span className="text-[1.75rem] font-bold leading-none tracking-tight sm:text-3xl">
                            NeuralTicker<span className="text-muted-foreground">.com</span>
                        </span>
                    </h1>
                    <p className="mt-3 text-center text-sm text-muted-foreground">
                        AI stock research, risk ratings and portfolio tracking.
                    </p>

                    <div aria-hidden className="mx-auto my-8 flex h-36 w-64 max-w-full items-stretch justify-between">
                        {CANDLES.map((c, i) => (
                            <div key={i} className="relative w-[10px]">
                                {/* Wick, then body on top of it */}
                                <div
                                    className={cn('absolute left-1/2 w-[2px] -translate-x-1/2 opacity-50', c.up ? 'bg-up' : 'bg-down')}
                                    style={{ bottom: `${c.bottom - 6}%`, height: `${c.height * 0.6 + 12}%` }}
                                />
                                <div
                                    className={cn('absolute inset-x-0 rounded-[1px]', c.up ? 'bg-up' : 'bg-down')}
                                    style={{ bottom: `${c.bottom}%`, height: `${c.height * 0.6}%` }}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="rounded-md bg-card p-4 shadow-2xl shadow-black/40 sm:p-5">
                        <Button
                            size="lg"
                            className="h-12 w-full gap-3 bg-foreground px-4 text-base font-semibold text-background hover:bg-foreground/90"
                            onClick={loginWithGoogle}
                        >
                            {/* Official Google 'G' Logo */}
                            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            Sign in with Google
                        </Button>
                        <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
                            By continuing you agree to the{' '}
                            <Link to="/terms" className="text-foreground underline-offset-2 hover:underline">Terms of Service</Link>
                            {' '}and{' '}
                            <Link to="/privacy" className="text-foreground underline-offset-2 hover:underline">Privacy Policy</Link>.
                        </p>
                    </div>
                </div>
            </main>

            <footer className="flex items-center justify-between gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
                <span className="num text-xs text-muted-foreground">v{__APP_VERSION__}</span>
                <nav aria-label="Legal" className="flex items-center">
                    <Link to="/privacy" className={FOOTER_LINK}>Privacy</Link>
                    <Link to="/terms" className={FOOTER_LINK}>Terms</Link>
                    <Link to="/about" className={FOOTER_LINK}>About</Link>
                </nav>
            </footer>
        </div>
    );
}
