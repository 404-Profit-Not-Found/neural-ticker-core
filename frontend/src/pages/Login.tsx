import { useAuth } from '../context/AuthContext';
import { Activity } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/card';
import { Button } from '../components/ui/button';

export function Login() {
    const { loginWithGoogle } = useAuth();

    return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
            <Card className="w-full max-w-sm border-border bg-card/50 backdrop-blur-sm shadow-lg">
                <CardHeader className="text-center space-y-2 pb-6">
                    <div className="flex justify-center mb-4">
                        <div className="p-3 rounded-full bg-primary/10">
                            <Activity size={32} className="text-primary" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight">Neural Ticker</CardTitle>
                    <CardDescription className="text-muted-foreground">
                        Institutional Market Intelligence
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <Button
                            variant="secondary"
                            size="lg"
                            className="w-full font-medium h-11"
                            onClick={loginWithGoogle}
                        >
                            <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                                <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
                            </svg>
                            Sign in with Google
                        </Button>
                    </div>
                </CardContent>
                <CardFooter className="justify-center pb-8">
                    <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider opacity-60">
                        Protected by Neural Gatekeeper
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
}
