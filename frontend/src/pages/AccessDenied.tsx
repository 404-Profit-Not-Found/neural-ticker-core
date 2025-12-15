import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { ShieldAlert, ArrowLeft, Mail } from 'lucide-react';

export function AccessDenied() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const errorType = searchParams.get('error');

    const isInviteError = errorType === 'invite_only';
    const isWaitlistJoined = errorType === 'waitlist_joined';
    const isWaitlistPending = errorType === 'waitlist_pending';

    const isSuccessOrPending = isWaitlistJoined || isWaitlistPending;

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full text-center space-y-8">
                {/* Icon */}
                <div className="flex justify-center">
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center border shadow-[0_0_30px_-5px_rgba(0,0,0,0.3)] ${isSuccessOrPending ? 'bg-green-500/10 border-green-500/20 shadow-green-500/30' : 'bg-red-500/10 border-red-500/20 shadow-red-500/30'}`}>
                        {isSuccessOrPending ? (
                            <Mail className="w-10 h-10 text-green-500" />
                        ) : (
                            <ShieldAlert className="w-10 h-10 text-red-500" />
                        )}
                    </div>
                </div>

                {/* Text Content */}
                <div className="space-y-3">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        {isWaitlistJoined ? "Thank You" :
                            isWaitlistPending ? "Already on Waitlist" :
                                (isInviteError ? "Access Restricted" : "Authentication Failed")}
                    </h1>
                    <p className="text-muted-foreground text-lg">
                        {isWaitlistJoined
                            ? "We've added you to our priority waitlist. We'll be in touch soon."
                            : isWaitlistPending
                                ? "You are already on our priority waitlist. We will email you once your access is approved."
                                : (isInviteError
                                    ? "This terminal is currently in private beta and accessible by invitation only."
                                    : "We couldn't sign you in. Please try again or contact support if the issue persists.")
                        }
                    </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-3 pt-4">
                    {!isSuccessOrPending && isInviteError && (
                        <Button
                            className="w-full h-11 text-base font-medium shadow-[0_0_20px_-5px_rgba(59,130,246,0.5)] bg-primary hover:bg-primary/90"
                            onClick={() => window.location.href = "/api/auth/google?intent=waitlist"}
                        >
                            <Mail className="mr-2 w-4 h-4" />
                            Join Priority Waitlist
                        </Button>
                    )}

                    {isSuccessOrPending ? (
                        <Button
                            variant="outline"
                            className="w-full h-11 border-border/50 hover:bg-muted/50"
                            onClick={() => window.location.href = "https://google.com"}
                        >
                            Exit
                        </Button>
                    ) : (
                        <Button
                            variant="outline"
                            className="w-full h-11 border-border/50 hover:bg-muted/50"
                            onClick={() => navigate('/')}
                        >
                            <ArrowLeft className="mr-2 w-4 h-4" />
                            Return to Home
                        </Button>
                    )}
                </div>

                {/* Footer Note */}
                <div className="pt-8 border-t border-border/30">
                    <p className="text-xs text-muted-foreground">
                        NeuralTicker.com &trade; &middot;
                    </p>
                </div>
            </div>
        </div>
    );
}
