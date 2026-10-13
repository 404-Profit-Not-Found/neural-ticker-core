import { Brand } from '../components/common/Brand';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { startGoogleLogin } from '../lib/base';
import { Button } from '../components/ui/button';
import { ShieldAlert, ArrowLeft, Mail, MailCheck, Clock } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * Sign-in outcomes that are not "you're in": invite-only, added to the
 * waitlist, already waiting, or a failed sign-in. One layout, four messages.
 */
export function AccessDenied() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const errorType = searchParams.get('error');

    const isInviteError = errorType === 'invite_only';
    const isWaitlistJoined = errorType === 'waitlist_joined';
    const isWaitlistPending = errorType === 'waitlist_pending';
    const isSuccessOrPending = isWaitlistJoined || isWaitlistPending;

    const Icon = isWaitlistJoined ? MailCheck : isWaitlistPending ? Clock : ShieldAlert;
    const title = isWaitlistJoined
        ? "You're on the waitlist"
        : isWaitlistPending
            ? 'Already on the waitlist'
            : isInviteError
                ? 'Invitation required'
                : "We couldn't sign you in";
    const message = isWaitlistJoined
        ? "Thanks — we've added you to the priority waitlist and will email you when your access is ready."
        : isWaitlistPending
            ? "You're already on the priority waitlist. We'll email you as soon as your access is approved."
            : isInviteError
                ? 'NeuralTicker is in private beta and open by invitation only. Join the waitlist and we will let you in as places open up.'
                : 'Something went wrong during sign-in. Please try again, or contact support if it keeps happening.';

    return (
        <div className="flex min-h-dvh flex-col bg-background text-foreground">
            <header className="flex justify-center px-4 pt-6 sm:pt-8">
                <Link
                    to="/login"
                    aria-label="NeuralTicker — sign in"
                    className="flex min-h-11 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                    <Brand className="text-xl sm:text-[1.375rem]" />
                </Link>
            </header>

            <main className="flex flex-1 items-center justify-center px-4 py-10">
                <div
                    role={isSuccessOrPending ? 'status' : 'alert'}
                    className="w-full max-w-md rounded-md bg-card p-6 text-center shadow-2xl shadow-black/40 sm:p-8"
                >
                    <span
                        aria-hidden
                        className={cn(
                            'mx-auto flex h-14 w-14 items-center justify-center rounded-md',
                            isSuccessOrPending ? 'bg-up/10 text-up' : 'bg-down/10 text-down',
                        )}
                    >
                        <Icon className="h-7 w-7" />
                    </span>

                    <h1 className="mt-5 text-2xl font-bold leading-tight tracking-tight">{title}</h1>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground sm:text-base">{message}</p>

                    <div className="mt-6 flex flex-col gap-2">
                        {isInviteError && (
                            <Button className="h-11 w-full text-base font-medium" onClick={() => startGoogleLogin('waitlist')}>
                                <Mail className="mr-2 h-4 w-4" aria-hidden />
                                Join the waitlist
                            </Button>
                        )}
                        {!isSuccessOrPending && !isInviteError && (
                            <Button className="h-11 w-full text-base font-medium" onClick={() => startGoogleLogin()}>
                                Try again
                            </Button>
                        )}
                        <Button variant="outline" className="h-11 w-full" onClick={() => navigate('/login')}>
                            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
                            Back to sign in
                        </Button>
                    </div>
                </div>
            </main>

            <footer className="flex items-center justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <nav aria-label="Legal" className="flex items-center text-xs text-muted-foreground">
                    <Link to="/privacy" className="inline-flex min-h-11 items-center rounded-md px-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Privacy</Link>
                    <Link to="/terms" className="inline-flex min-h-11 items-center rounded-md px-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Terms</Link>
                </nav>
            </footer>
        </div>
    );
}
