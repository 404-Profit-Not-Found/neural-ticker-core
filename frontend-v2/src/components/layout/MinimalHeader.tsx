import { Brand } from '../common/Brand';
import { Link } from 'react-router-dom';

/** Header for public pages: the brand lockup only (logo + wordmark), no app chrome. */
export function MinimalHeader() {
    return (
        <header className="rgb-border-b sticky top-0 z-50 h-14 bg-background">
            <div className="container mx-auto flex h-full max-w-[90rem] items-center px-4">
                <Link
                    to="/"
                    aria-label="NeuralTicker — home"
                    className="group flex min-h-11 flex-shrink-0 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                    <Brand className="text-xl text-foreground transition-opacity group-hover:opacity-80 sm:text-[1.375rem]" />
                </Link>
            </div>
        </header>
    );
}
