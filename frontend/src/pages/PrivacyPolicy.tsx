import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Lock, Eye, Server } from 'lucide-react';
import { Button } from '../components/ui/button';

export function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground animate-in fade-in duration-500">
      <div className="container max-w-4xl mx-auto px-4 py-8 md:py-12">
        
        {/* Header */}
        <div className="mb-8 md:mb-12">
          <Button 
            variant="ghost" 
            className="mb-4 pl-0 hover:pl-2 transition-all"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <Shield className="w-8 h-8" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Privacy Policy</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Last updated: {new Date().toLocaleDateString()}
          </p>
        </div>

        {/* Content */}
        <div className="prose prose-invert max-w-none space-y-12">
          
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-xl font-semibold text-primary/90">
              <Eye className="w-5 h-5" />
              <h2>1. Information We Collect</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              We collect information you provide directly to us when you create an account, specifically your email address and Google profile information provided via Google SSO. We also automatically collect certain information when you interact with our services, such as usage data and device information, to improve system performance and security.
            </p>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2 text-xl font-semibold text-primary/90">
              <Lock className="w-5 h-5" />
              <h2>2. How We Use Your Information</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              We use the collected information to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Authenticate your identity and provide access to the Neural Ticker platform.</li>
              <li>Personalize your dashboard and watchlist experiences.</li>
              <li>Analyze usage patterns to improve our AI prediction models.</li>
              <li>Communicate with you regarding account updates or service announcements.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2 text-xl font-semibold text-primary/90">
              <Server className="w-5 h-5" />
              <h2>3. Data Storage & Security</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              We implement appropriate technical and organizational measures to protect your personal data against unauthorized or unlawful processing, accidental loss, destruction, or damage. Your data is stored securely on cloud infrastructure with industry-standard encryption protocols.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-primary/90">4. Third-Party Services</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our service may contain links to third-party websites or services (such as StockTwits or Financial News sources) that are not owned or controlled by Neural Ticker. We have no control over and assume no responsibility for the content, privacy policies, or practices of any third-party websites or services.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-primary/90">5. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about this Privacy Policy, please contact us at granger4783@gmail.com.
            </p>
          </section>

        </div>
        
        <div className="mt-16 pt-8 border-t border-border text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Neural Ticker. All rights reserved.
        </div>
      </div>
    </div>
  );
}
