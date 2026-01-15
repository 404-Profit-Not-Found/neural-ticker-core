import { Link } from 'react-router-dom';

export function MinimalHeader() {
    return (
        <header className="rgb-border-b h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
            <div className="container max-w-[90rem] mx-auto h-full flex items-center justify-between px-4">
                {/* Left Section: Logo Only */}
                <div className="flex-1 flex items-center justify-start gap-4">
                    <Link
                        to="/"
                        className="flex items-center gap-2 text-lg font-bold text-foreground tracking-tight hover:opacity-80 transition-opacity flex-shrink-0"
                    >
                        <span>NeuralTicker.com</span>
                    </Link>
                </div>

                {/* Right Section: Empty for now */}
                <div className="flex-1"></div>
            </div>
        </header>
    );
}
