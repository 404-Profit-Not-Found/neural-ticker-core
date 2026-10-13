import { NotFoundException } from '@nestjs/common';
import { RiskTools } from './risk.tools';

/**
 * Both risk-score reads resolve their symbol through
 * MarketDataService.getSnapshot(), which creates an untracked ticker — so an
 * anonymous caller passes the public-read gate first. Over the real MCP HTTP
 * transport, with the real TickersService gate: test/mcp.e2e-spec.ts.
 */
describe('RiskTools — anonymous callers never reach a creating read', () => {
  const riskReward = {
    getLatestScore: jest.fn().mockResolvedValue({ overall_score: 7 }),
    getScoreHistory: jest.fn().mockResolvedValue([]),
  };
  const tickers = { assertPublicReadAllowed: jest.fn() };
  const tools = new RiskTools(riskReward as any, tickers as any);

  const anonymous = {};
  const signedIn = { user: { id: 'user-1', role: 'user' } };

  beforeEach(() => {
    jest.clearAllMocks();
    tickers.assertPublicReadAllowed.mockResolvedValue(undefined);
  });

  const TOOLS: [string, (req: any) => Promise<any>, jest.Mock][] = [
    [
      'get_risk_score',
      (req) => tools.getRiskScore({ symbol: 'NVDA' }, undefined, req),
      riskReward.getLatestScore,
    ],
    [
      'get_risk_score_history',
      (req) => tools.getRiskScoreHistory({ symbol: 'NVDA' }, undefined, req),
      riskReward.getScoreHistory,
    ],
  ];

  describe.each(TOOLS)('%s', (_tool, run, serviceCall) => {
    it('asks the gate first for an anonymous caller, and stops when it refuses', async () => {
      tickers.assertPublicReadAllowed.mockRejectedValue(
        new NotFoundException('Ticker NVDA not found'),
      );

      await expect(run(anonymous)).rejects.toThrow('Ticker NVDA not found');

      expect(tickers.assertPublicReadAllowed).toHaveBeenCalledWith(
        'NVDA',
        false,
      );
      expect(serviceCall).not.toHaveBeenCalled();
    });

    it('serves an anonymous caller once the gate allows the symbol (a tracked ticker)', async () => {
      await run(anonymous);

      expect(tickers.assertPublicReadAllowed).toHaveBeenCalledTimes(1);
      expect(serviceCall).toHaveBeenCalledWith('NVDA');
    });

    it('does not gate a signed-in caller', async () => {
      await run(signedIn);

      expect(tickers.assertPublicReadAllowed).not.toHaveBeenCalled();
      expect(serviceCall).toHaveBeenCalledWith('NVDA');
    });
  });
});
