// Privacy Policy page.
import { InfoPage } from './_info-page.tsx';

export function PrivacyPage() {
  return (
    <InfoPage
      title="Privacy Policy"
      sections={[
        {
          h: 'WHAT WE COLLECT',
          p: `• Email + name + avatar from Google OAuth on sign-in
• Your portfolio positions, watchlists, price alerts (entered by you)
• Your research requests and the AI responses to them
• Login timestamps and device user-agent for security`,
        },
        {
          h: "WHAT WE DON'T COLLECT",
          p: `• No payment info (we don't take payments yet)
• No third-party analytics (no Google Analytics, no Facebook Pixel)
• No advertising trackers
• No tracking across other websites`,
        },
        {
          h: 'DATA STORAGE',
          p: `All data lives in our PostgreSQL database. Auth cookies are HttpOnly, secure
when running in production. We use VAPID for push notifications — your push
subscription endpoint is stored to send you alert triggers.`,
        },
        {
          h: 'YOUR RIGHTS',
          p: `• Export: contact branislavlang@gmail.com for a full data dump
• Delete: same address — full account deletion within 7 days
• Correct: edit via UI (Profile / Portfolio / Watchlists / Alerts pages)`,
        },
      ]}
    />
  );
}
