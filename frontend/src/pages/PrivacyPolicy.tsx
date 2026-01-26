import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';

export function PrivacyPolicy() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-3xl mx-auto px-6 py-12 md:py-20">
        
        {/* Navigation */}
        <div className="mb-12">
          <Button 
            variant="ghost" 
            className="pl-0 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => navigate(user ? '/' : '/login')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {user ? 'Back to Dashboard' : 'Back to Login'}
          </Button>
        </div>

        {/* Header */}
        <header className="mb-16">
          <h1 className="text-4xl font-bold tracking-tight mb-4">Privacy Policy</h1>
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">
            Effective Date: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </header>

        {/* Content */}
        <div className="space-y-12 text-sm md:text-base leading-relaxed text-muted-foreground">
          
          <section>
            <h2 className="text-foreground text-lg font-semibold mb-4">1. Information We Collect</h2>
            <p>
              We collect information you provide directly to us when you create an account, specifically your email address and Google profile information provided via Google SSO. We also automatically collect certain information when you interact with our services, such as usage data and device information, to improve system performance and security.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-semibold mb-4">2. How We Use Your Information</h2>
            <p className="mb-4">
              We use the collected information to:
            </p>
            <ul className="space-y-2 list-inside list-disc">
              <li>Authenticate your identity and provide access to the Neural Ticker platform.</li>
              <li>Personalize your dashboard and watchlist experiences.</li>
              <li>Analyze usage patterns to improve our AI prediction models.</li>
              <li>Communicate with you regarding account updates or service announcements.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-semibold mb-4">3. Data Storage & Security</h2>
            <p>
              We implement appropriate technical and organizational measures to protect your personal data against unauthorized or unlawful processing, accidental loss, destruction, or damage. Your data is stored securely on cloud infrastructure with industry-standard encryption protocols.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-semibold mb-4">4. Third-Party Services</h2>
            <p>
              Our service may contain links to third-party websites or services (such as StockTwits or Financial News sources) that are not owned or controlled by Neural Ticker. We have no control over and assume no responsibility for the content, privacy policies, or practices of any third-party websites or services.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-semibold mb-4">5. Contact Information</h2>
            <p>
              If you have any questions about this Privacy Policy, please contact us at <span className="text-primary hover:underline cursor-pointer">granger4783@gmail.com</span>.
            </p>
          </section>

        </div>
        
        <footer className="mt-24 pt-8 border-t border-border flex justify-between items-center text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
          <span>&copy; {new Date().getFullYear()} Neural Ticker Core</span>
          <span>Security First Architecture</span>
        </footer>
      </div>
    </div>
  );
}
