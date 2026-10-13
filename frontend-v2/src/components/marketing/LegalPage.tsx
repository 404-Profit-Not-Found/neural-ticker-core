import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../ui/button';
import { formatDate } from '../../lib/datetime';

/**
 * The date the current wording of the Privacy Policy and Terms of Service took
 * effect. A fixed constant on purpose: it used to be `new Date()`, so both
 * documents claimed to have changed "today", every day.
 *
 * NOTE(owner): 26 Jan 2026 is the date this wording was last committed
 * (git: "chore: improved terms"). Confirm it, and update it whenever the text
 * below changes.
 */
export const LEGAL_EFFECTIVE_DATE = '2026-01-26';

/** Where privacy / legal questions go. NOTE(owner): confirm this address. */
export const LEGAL_CONTACT_EMAIL = 'granger4783@gmail.com';

const LINKS = [
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms of Service' },
  { to: '/about', label: 'About' },
] as const;

interface LegalPageProps {
  title: string;
  /** "Effective date" for the policy, "Last updated" for the terms. */
  dateLabel: string;
  children: ReactNode;
}

/** Shared frame for the public legal documents: same header, measure and footer. */
export function LegalPage({ title, dateLabel, children }: LegalPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  // These routes are public, so the session is not loaded here and we cannot
  // tell a signed-in reader from a visitor. "Back" is true for both: return to
  // where they came from, or to the app's entry point (which sends a visitor
  // to sign-in) when the page was opened directly.
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/'));

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 md:py-16">
        <div className="mb-8 md:mb-12">
          <Button variant="ghost" className="-ml-3 h-11 text-muted-foreground hover:text-foreground" onClick={goBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        <header className="mb-10 md:mb-14">
          <p className="label-micro mb-2">NeuralTicker</p>
          <h1 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {dateLabel}: <time dateTime={LEGAL_EFFECTIVE_DATE} className="num text-foreground">{formatDate(LEGAL_EFFECTIVE_DATE)}</time>
          </p>
        </header>

        <div className="space-y-10 text-[15px] leading-relaxed text-muted-foreground md:text-base">{children}</div>

        <footer className="mt-16 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>&copy; {new Date().getFullYear()} NeuralTicker</span>
          <nav aria-label="Legal" className="-mx-2 flex flex-wrap items-center">
            {LINKS.filter((link) => link.to !== location.pathname).map((link) => (
              <Link key={link.to} to={link.to} className="inline-flex min-h-11 items-center rounded-md px-2 text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {link.label}
              </Link>
            ))}
          </nav>
        </footer>
      </div>
    </div>
  );
}
