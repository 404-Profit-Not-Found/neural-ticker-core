// Terms of Service page.
import { InfoPage } from './_info-page.tsx';

export function TermsPage() {
  return (
    <InfoPage
      title="Terms of Service"
      sections={[
        {
          h: 'USAGE',
          p: `NEURAL//TICKER provides AI-generated market research and analysis tools. The
service is offered as-is, with no warranty of fitness for any particular purpose
including investment decisions. Nothing on this site constitutes financial
advice.`,
        },
        {
          h: 'NO INVESTMENT ADVICE',
          p: `AI-generated content (research reports, scenarios, ratings, sentiment) is
algorithmically produced and may be inaccurate, outdated, or incomplete. Always
verify with primary sources before acting on it. Past performance does not
guarantee future results.`,
        },
        {
          h: 'ACCEPTABLE USE',
          p: `• Do not attempt to overload, scrape, or abuse the API
• Do not impersonate other users
• Credits are non-transferable and have no monetary value outside the platform
• Public research reports shared via signed URLs may be revoked at any time`,
        },
        {
          h: 'TERMINATION',
          p: `We may suspend or terminate access at any time for violation of these terms
or for any other reason at our sole discretion.`,
        },
      ]}
    />
  );
}
