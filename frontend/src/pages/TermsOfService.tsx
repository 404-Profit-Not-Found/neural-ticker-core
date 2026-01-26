import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';

export function TermsOfService() {
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
          <h1 className="text-4xl font-bold tracking-tight mb-4">Terms of Service</h1>
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">
            Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </header>

        {/* Content */}
        <div className="space-y-12 text-sm md:text-base leading-relaxed text-muted-foreground">
          
          <section>
            <h2 className="text-foreground text-lg font-semibold mb-4">1. Agreement to Terms</h2>
            <p>
              By accessing or using Neural Ticker, you agree to be bound by these Terms of Service and our Privacy Policy. If you disagree with any part of the terms, you may not access the service.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-semibold mb-4">2. Use License</h2>
            <p className="mb-4">
              Permission is granted to temporarily access the materials (information or software) on Neural Ticker's platform for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license, you may not:
            </p>
            <ul className="space-y-2 list-inside list-disc">
              <li>Modify or copy the materials;</li>
              <li>Use the materials for any commercial purpose;</li>
              <li>Attempt to decompile or reverse engineer any software contained on the platform;</li>
              <li>Remove any copyright or other proprietary notations from the materials.</li>
            </ul>
          </section>

          <section className="bg-muted/30 p-6 rounded-lg border border-border">
            <h2 className="text-foreground text-lg font-semibold mb-4 flex items-center gap-2">
              3. Financial Disclaimer
            </h2>
            <p className="text-foreground/90 font-medium italic">
              The content provided on Neural Ticker, including AI-generated insights, predictions, and market data, is for informational purposes only. It does not constitute financial, investment, or legal advice. You alone assume the sole responsibility of evaluating the merits and risks associated with the use of any information provided.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-semibold mb-4">4. AI Predictions & Accuracy</h2>
            <p>
              Our services utilize artificial intelligence and machine learning algorithms to generate market insights. While we strive for accuracy, these predictions are probabilistic in nature and not guaranteed. Neural Ticker makes no warranties, expressed or implied, regarding the accuracy or reliability of these predictions.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-semibold mb-4">5. Limitation of Liability</h2>
            <p>
              In no event shall Neural Ticker or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on Neural Ticker's website.
            </p>
          </section>

        </div>
        
        <footer className="mt-24 pt-8 border-t border-border flex justify-between items-center text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
          <span>&copy; {new Date().getFullYear()} Neural Ticker Core</span>
          <span>Compliance & Transparency</span>
        </footer>
      </div>
    </div>
  );
}
