import { AboutHero } from '../components/marketing/AboutHero';
import { AboutArchitecture } from '../components/marketing/AboutArchitecture';
import { AboutStory } from '../components/marketing/AboutStory';
import { appPath } from '../lib/base';

export function AboutPage() {
    return (
        <div className="min-h-screen bg-background">
            <AboutHero />

            <div className="container mx-auto max-w-5xl space-y-16 px-4 py-12 md:space-y-24 md:py-16">
                <AboutStory />
                <AboutArchitecture />
            </div>

            {/* Plain anchors: this page also renders outside the router (onboarding). */}
            <footer className="mx-auto flex max-w-5xl flex-col gap-3 px-4 pb-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>&copy; {new Date().getFullYear()} NeuralTicker</span>
                <nav aria-label="Legal" className="-mx-2 flex flex-wrap items-center">
                    <a href={appPath('/privacy')} className="inline-flex min-h-11 items-center rounded-md px-2 text-primary hover:underline">Privacy Policy</a>
                    <a href={appPath('/terms')} className="inline-flex min-h-11 items-center rounded-md px-2 text-primary hover:underline">Terms of Service</a>
                </nav>
            </footer>
        </div>
    );
}
