import { LegalPage } from '../components/marketing/LegalPage';

export function TermsOfService() {
  return (
    <LegalPage title="Terms of Service" dateLabel="Last updated">
          
          <section>
            <h2 className="text-foreground text-lg font-semibold mb-4">1. Agreement to Terms</h2>
            <p>
              By accessing or using NeuralTicker, you agree to be bound by these Terms of Service and our Privacy Policy. If you disagree with any part of the terms, you may not access the service.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-semibold mb-4">2. Use License</h2>
            <p className="mb-4">
              Permission is granted to temporarily access the materials (information or software) on NeuralTicker's platform for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license, you may not:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Modify or copy the materials;</li>
              <li>Use the materials for any commercial purpose;</li>
              <li>Attempt to decompile or reverse engineer any software contained on the platform;</li>
              <li>Remove any copyright or other proprietary notations from the materials.</li>
            </ul>
          </section>

          <section className="rounded-lg bg-card p-5 sm:p-6">
            <h2 className="text-foreground text-lg font-semibold mb-4 flex items-center gap-2">
              3. Financial Disclaimer
            </h2>
            <p className="font-medium text-foreground">
              The content provided on NeuralTicker, including AI-generated insights, predictions, and market data, is for informational purposes only. It does not constitute financial, investment, or legal advice. You alone assume the sole responsibility of evaluating the merits and risks associated with the use of any information provided.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-semibold mb-4">4. AI Predictions & Accuracy</h2>
            <p>
              Our services utilize artificial intelligence and machine learning algorithms to generate market insights. While we strive for accuracy, these predictions are probabilistic in nature and not guaranteed. NeuralTicker makes no warranties, expressed or implied, regarding the accuracy or reliability of these predictions.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-semibold mb-4">5. Limitation of Liability</h2>
            <p>
              In no event shall NeuralTicker or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on NeuralTicker's website.
            </p>
          </section>
    </LegalPage>
  );
}
