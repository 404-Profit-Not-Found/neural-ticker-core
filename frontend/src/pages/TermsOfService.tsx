import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Scale, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';
import { Button } from '../components/ui/button';

export function TermsOfService() {
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
              <Scale className="w-8 h-8" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Terms of Service</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Last updated: {new Date().toLocaleDateString()}
          </p>
        </div>

        {/* Content */}
        <div className="prose prose-invert max-w-none space-y-12">
          
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-xl font-semibold text-primary/90">
              <FileText className="w-5 h-5" />
              <h2>1. Agreement to Terms</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              By accessing or using Neural Ticker, you agree to be bound by these Terms of Service and our Privacy Policy. If you disagree with any part of the terms, you may not access the service.
            </p>
          </section>

          <section className="space-y-4">
             <div className="flex items-center gap-2 text-xl font-semibold text-primary/90">
              <CheckCircle2 className="w-5 h-5" />
              <h2>2. Use License</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Permission is granted to temporarily access the materials (information or software) on Neural Ticker's website for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license, you may not:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Modify or copy the materials;</li>
              <li>Use the materials for any commercial purpose, or for any public display;</li>
              <li>Attempt to decompile or reverse engineer any software contained on Neural Ticker's website;</li>
              <li>Remove any copyright or other proprietary notations from the materials.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2 text-xl font-semibold text-primary/90">
              <AlertCircle className="w-5 h-5" />
              <h2>3. Disclaimer regarding Financial Advice</h2>
            </div>
            <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-yellow-200/90 leading-relaxed font-medium">
                The content provided on Neural Ticker, including AI-generated insights, predictions, and market data, is for informational purposes only. It does not constitute financial, investment, or legal advice. You alone assume the sole responsibility of evaluating the merits and risks associated with the use of any information or other content on the service.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-primary/90">4. AI Predictions & Accuracy</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our services utilize artificial intelligence and machine learning algorithms to generate market insights. While we strive for accuracy, these predictions are probabilistic in nature and not guaranteed. Neural Ticker makes no warranties, expressed or implied, regarding the accuracy or reliability of these predictions.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-primary/90">5. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              In no event shall Neural Ticker or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on Neural Ticker's website.
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
