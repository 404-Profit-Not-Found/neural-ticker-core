import { Link } from 'react-router-dom';

/** Header for public pages: the brand lockup only (logo + wordmark), no app chrome. */
export function MinimalHeader() {
    return (
        <header className="rgb-border-b sticky top-0 z-50 h-14 bg-background">
            <div className="container mx-auto flex h-full max-w-[90rem] items-center px-4">
                <Link
                    to="/"
                    aria-label="NeuralTicker — home"
                    className="group flex flex-shrink-0 items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                    <img
                        src={`${import.meta.env.BASE_URL}favicon.svg`}
                        alt=""
                        width={19}
                        height={24}
                        className="h-6 w-auto shrink-0"
                    />
                    <span aria-hidden className="text-lg font-bold leading-none tracking-tight text-foreground transition-opacity group-hover:opacity-80">
                        NeuralTicker<span className="text-muted-foreground">.com</span>
                    </span>
                </Link>
            </div>
        </header>
    );
}
