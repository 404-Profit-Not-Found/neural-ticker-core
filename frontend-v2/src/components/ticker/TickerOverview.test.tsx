import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { TickerOverview } from './TickerOverview';
import type { TickerData } from '../../types/ticker';

const profile: TickerData['profile'] = {
  logo_url: '',
  symbol: 'NVDA',
  exchange: 'NASDAQ NMS - GLOBAL MARKET',
  name: 'NVIDIA Corp',
  industry: 'Semiconductors',
  web_url: 'https://www.nvidia.com/',
  description: 'NVIDIA designs and sells semiconductors.',
  currency: 'USD',
};

const riskAnalysis: TickerData['risk_analysis'] = {
  overall_score: 8.4,
  summary: 'ok',
  dimensions: {},
  scenarios: [
    { scenario_type: 'bull', probability: 0.25, description: 'Bull thesis', price_mid: 193.63, price_low: 178.14, price_high: 209.12, expected_market_cap: 4.7e12, key_drivers: [] },
    { scenario_type: 'bear', probability: 0.25, description: 'Bear thesis', price_mid: 108.65, price_low: 99.96, price_high: 117.34, expected_market_cap: 2.7e12, key_drivers: [] },
    { scenario_type: 'base', probability: 0.5, description: 'Base thesis', price_mid: 159.64, price_low: 146.87, price_high: 172.41, expected_market_cap: 3.9e12, key_drivers: [] },
  ],
  catalysts: [{ description: 'Next quarterly earnings' }],
  red_flags: ['Negative free cash flow'],
  financial_risk: 3,
  execution_risk: 3.5,
  dilution_risk: 2.4,
  competitive_risk: 3.1,
  regulatory_risk: 3.8,
};

const freshNews = () => ({
  sentiment: 'BULLISH',
  score: 9,
  summary: 'Bullish set-up into the next catalyst.',
  updated_at: new Date(Date.now() - 5 * 3600_000).toISOString(),
  research_id: '111',
});

const renderOverview = (props: Partial<React.ComponentProps<typeof TickerOverview>> = {}) =>
  render(
    <MemoryRouter>
      <TickerOverview profile={profile} market_data={{ price: 121.4 }} risk_analysis={riskAnalysis} {...props} />
    </MemoryRouter>,
  );

describe('TickerOverview', () => {
  describe('without an analysis', () => {
    it('says there is no analysis instead of claiming there are no risks', () => {
      renderOverview({ risk_analysis: undefined });

      expect(screen.getByText('No AI analysis yet')).toBeInTheDocument();
      // The old empty copy read like a clean bill of health.
      expect(screen.queryByText(/No critical red flags/i)).toBeNull();
      expect(screen.queryByText(/No specific catalysts/i)).toBeNull();
      expect(screen.queryByRole('heading', { name: /Risk factors/i })).toBeNull();
      expect(screen.queryByRole('heading', { name: /Growth drivers/i })).toBeNull();
      expect(screen.queryByRole('region', { name: 'Investment thesis' })).toBeNull();
      expect(screen.queryByRole('region', { name: 'Price scenarios' })).toBeNull();
    });

    it('offers the action that fixes it', () => {
      renderOverview({ risk_analysis: null });
      expect(screen.getByRole('link', { name: /Run research/i })).toHaveAttribute('href', '/ticker/NVDA/research');
    });

    it('has no call to action on the public report', () => {
      renderOverview({ risk_analysis: null, variant: 'public' });
      expect(screen.getByText('No AI analysis yet')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Run research/i })).toBeNull();
    });
  });

  describe('with an analysis', () => {
    it('lists scenarios bear → base → bull with their targets', () => {
      renderOverview();
      const scenarios = screen.getByRole('region', { name: 'Price scenarios' });
      const cases = within(scenarios).getAllByRole('region');
      expect(cases.map((c) => c.getAttribute('aria-label'))).toEqual(['bear case', 'base case', 'bull case']);
      expect(within(cases[0]).getByText('$108.65')).toBeInTheDocument();
      expect(within(cases[0]).getByText('10.5%')).toBeInTheDocument();
      expect(within(cases[2]).getByText('59.5%')).toBeInTheDocument();
      // The thesis is shown in full, not clamped.
      expect(within(cases[1]).getByText('Base thesis').className).not.toContain('line-clamp');
    });

    it('shows risk factors and growth drivers', () => {
      renderOverview();
      expect(screen.getByText('Negative free cash flow')).toBeInTheDocument();
      expect(screen.getByText('Next quarterly earnings')).toBeInTheDocument();
    });

    it('says when a finished analysis flagged nothing', () => {
      renderOverview({ risk_analysis: { ...riskAnalysis, red_flags: [], catalysts: [] } });
      expect(screen.getByText('None flagged in the latest analysis.')).toBeInTheDocument();
      expect(screen.getByText('None identified in the latest analysis.')).toBeInTheDocument();
    });

    it('prints an em dash, not $0.00, for a scenario without a usable target', () => {
      const scenarios = riskAnalysis.scenarios.map((s) =>
        s.scenario_type === 'bear' ? { ...s, price_mid: null as unknown as number, price_low: 0, price_high: 0, expected_market_cap: 0 } : s,
      );
      renderOverview({ risk_analysis: { ...riskAnalysis, scenarios } });
      const bear = screen.getByRole('region', { name: 'bear case' });
      expect(within(bear).getAllByText('—').length).toBeGreaterThan(0);
      expect(within(bear).queryByText('$0.00')).toBeNull();
      expect(within(bear).queryByText(/Range/)).toBeNull();
      expect(within(bear).queryByText(/Implied cap/)).toBeNull();
    });
  });

  describe('headline banner', () => {
    it('links a fresh, high-impact headline to its research note', () => {
      renderOverview({ news: freshNews() });
      const link = screen.getByRole('link', { name: /Breaking news: Bullish set-up/i });
      expect(link).toHaveAttribute('href', '/ticker/NVDA/research/111');
      expect(screen.getByText('Impact 9/10')).toBeInTheDocument();
    });

    it('is not a link on the public report', () => {
      renderOverview({ news: freshNews(), variant: 'public' });
      expect(screen.getByText('Bullish set-up into the next catalyst.')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Breaking news/i })).toBeNull();
    });

    it('is hidden when the headline is stale or low-impact', () => {
      const stale = { ...freshNews(), updated_at: new Date(Date.now() - 9 * 86400_000).toISOString() };
      const { unmount } = renderOverview({ news: stale });
      expect(screen.queryByText('Bullish set-up into the next catalyst.')).toBeNull();
      unmount();

      renderOverview({ news: { ...freshNews(), score: 3 } });
      expect(screen.queryByText('Bullish set-up into the next catalyst.')).toBeNull();
    });
  });

  describe('about', () => {
    it('shows the short exchange code and the site host', () => {
      renderOverview();
      const about = screen.getByRole('region', { name: 'About NVDA' });
      expect(within(about).getByText('NASDAQ')).toBeInTheDocument();
      expect(within(about).queryByText('NASDAQ NMS - GLOBAL MARKET')).toBeNull();
      expect(within(about).getByRole('link', { name: 'nvidia.com' })).toHaveAttribute('href', 'https://www.nvidia.com/');
    });
  });

  it('shows the ticker news list in the app but not on the public report', () => {
    const { unmount } = renderOverview({ newsList: [] });
    expect(screen.getByRole('region', { name: 'Latest news' })).toBeInTheDocument();
    expect(screen.getByText('No recent news')).toBeInTheDocument();
    unmount();

    renderOverview({ newsList: [], variant: 'public' });
    expect(screen.queryByRole('region', { name: 'Latest news' })).toBeNull();
  });
});
