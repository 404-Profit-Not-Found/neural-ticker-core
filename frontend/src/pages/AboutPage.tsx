import { AboutHero } from '../components/marketing/AboutHero';
import { AboutArchitecture } from '../components/marketing/AboutArchitecture';
import { AboutStory } from '../components/marketing/AboutStory';

export function AboutPage() {
    return (
        <div className="min-h-screen bg-background pb-20">
            <AboutHero />

            <div className="container max-w-5xl mx-auto px-4 py-16 space-y-24">
                <AboutStory />
                <AboutArchitecture />
            </div>
        </div>
    );
}
