import { LegalPage, LEGAL_CONTACT_EMAIL } from '../components/marketing/LegalPage';

export function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy Policy" dateLabel="Effective date">
          
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
            <ul className="list-disc space-y-2 pl-5">
              <li>Authenticate your identity and provide access to the NeuralTicker platform.</li>
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
              Our service may contain links to third-party websites or services (such as StockTwits or Financial News sources) that are not owned or controlled by NeuralTicker. We have no control over and assume no responsibility for the content, privacy policies, or practices of any third-party websites or services.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-semibold mb-4">5. Contact Information</h2>
            <p>
              If you have any questions about this Privacy Policy, please contact us at <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{LEGAL_CONTACT_EMAIL}</a>.
            </p>
          </section>
    </LegalPage>
  );
}
