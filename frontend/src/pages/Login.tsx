import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';

export function Login() {
    const { loginWithGoogle } = useAuth();
    
    return (
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#09090b] text-foreground">
             {/* Hero Background - Matched to Loading Screen */}
             <div className="absolute inset-0 z-0">
                {/* Manual Grid to ensure exact match with index.html */}
                <div 
                    className="absolute inset-0" 
                    style={{
                        backgroundImage: `
                            linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), 
                            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
                        `,
                        backgroundSize: '28px 28px',
                        backgroundPosition: 'center top'
                    }}
                ></div>
                
                {/* Manual Blobs to ensure exact match with index.html */}
                <div 
                    className="absolute inset-0"
                    style={{
                        backgroundImage: `
                            radial-gradient(circle at 15% 20%, rgba(37, 99, 235, 0.15), transparent 35%),
                            radial-gradient(circle at 80% 0%, rgba(168, 85, 247, 0.12), transparent 30%)
                        `,
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '100% 100%'
                    }}
                ></div>

                 {/* Subtle Gradient Overlay for depth at bottom only */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#09090b] via-transparent to-transparent opacity-80"></div>
            </div>

            <div className="relative z-10 w-full max-w-[350px] space-y-12 animate-in fade-in zoom-in-95 duration-500 p-4">
                {/* Header Section - JUST THE TITLE */}
                <div className="flex flex-col items-center space-y-4 text-center">
                    <div className="space-y-2">
                        {/* Title with Gradient - Matched to Loading Screen */}
                        <h1 className="text-[3.5rem] leading-none font-light tracking-tight text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">
                            Neural Ticker
                        </h1>
                    </div>
                </div>

                {/* Action Section - Simplified */}
                <div className="bg-card/30 backdrop-blur-md border border-white/5 rounded-xl p-1 pt-1 pb-1 shadow-2xl overflow-hidden">
                    <Button
                        variant="ghost"
                        size="lg"
                        className="w-full font-medium h-12 relative overflow-hidden group hover:bg-white/5 transition-all duration-300 gap-3"
                        onClick={loginWithGoogle}
                    >
                        {/* Official Google 'G' Logo */}
                        <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        <span className="text-white/90 group-hover:text-white transition-colors">Sign in with Google</span>
                    </Button>
                </div>
            </div>
            
            {/* Version Number (Bottom Left) */}
            <div className="absolute bottom-8 left-8 text-left z-20">
                <span className="text-xs font-mono text-white/20">v{__APP_VERSION__}</span>
            </div>
        </div>
    );
}
