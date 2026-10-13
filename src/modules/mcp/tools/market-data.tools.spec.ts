import { NotFoundException } from '@nestjs/common';
import { MarketDataTools } from './market-data.tools';

/**
 * The anonymous-read gate of the market-data tools, called directly. The same
 * behaviour is exercised over the real MCP HTTP transport, with the real
 * TickersService gate, in test/mcp.e2e-spec.ts.
 */
describe('MarketDataTools — anonymous callers never reach a creating read', () => {
  const marketData = {
    getSnapshot: jest.fn().mockResolvedValue({ ok: true }),
    getSnapshots: jest.fn((symbols: string[]) =>
      Promise.resolve(symbols.map((symbol) => ({ symbol, price: 1 }))),
    ),
    getHistory: jest.fn().mockResolvedValue([]),
    getCompanyNews: jest.fn().mockResolvedValue([]),
  };
  const tickers = {
    assertPublicReadAllowed: jest.fn(),
    partitionPublicRead: jest.fn(),
  };
  const tools = new MarketDataTools(
    marketData as any,
    {} as any,
    tickers as any,
    {} as any,
  );

  const anonymous = {};
  const signedIn = { user: { id: 'user-1', role: 'user' } };
  const parse = (result: any) => JSON.parse(result.content[0].text);

  beforeEach(() => {
    jest.clearAllMocks();
    tickers.assertPublicReadAllowed.mockResolvedValue(undefined);
  });

  const SINGLE: [string, (req: any) => Promise<any>, jest.Mock][] = [
    [
      'get_ticker_snapshot',
      (req) => tools.getTickerSnapshot({ symbol: 'NVDA' }, undefined, req),
      marketData.getSnapshot,
    ],
    [
      'get_ticker_history',
      (req) =>
        tools.getTickerHistory(
          {
            symbol: 'NVDA',
            interval: '1d',
            from: '2026-01-01',
            to: '2026-02-01',
          },
          undefined,
          req,
        ),
      marketData.getHistory,
    ],
    [
      'get_company_news',
      (req) => tools.getCompanyNews({ symbol: 'NVDA' }, undefined, req),
      marketData.getCompanyNews,
    ],
  ];

  describe.each(SINGLE)('%s', (_tool, run, serviceCall) => {
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
      expect(serviceCall).toHaveBeenCalledTimes(1);
    });

    it('does not gate a signed-in caller', async () => {
      await run(signedIn);

      expect(tickers.assertPublicReadAllowed).not.toHaveBeenCalled();
      expect(serviceCall).toHaveBeenCalledTimes(1);
    });
  });

  describe('get_ticker_snapshots', () => {
    it('anonymous: only the readable symbols reach the snapshot path; the refused ones are per-symbol entries', async () => {
      tickers.partitionPublicRead.mockResolvedValue({
        readable: ['AAPL'],
        refused: [{ symbol: 'NVDA', error: 'Ticker NVDA not found' }],
      });

      const result = await tools.getTickerSnapshots(
        { symbols: ['AAPL', 'NVDA'] },
        undefined,
        anonymous,
      );

      expect(tickers.partitionPublicRead).toHaveBeenCalledWith(
        ['AAPL', 'NVDA'],
        false,
      );
      expect(marketData.getSnapshots).toHaveBeenCalledWith(['AAPL']);
      expect(parse(result)).toEqual([
        { symbol: 'AAPL', price: 1 },
        { symbol: 'NVDA', error: 'Ticker NVDA not found' },
      ]);
    });

    it('anonymous with nothing readable: the snapshot path is not called', async () => {
      tickers.partitionPublicRead.mockResolvedValue({
        readable: [],
        refused: [{ symbol: 'NVDA', error: 'Ticker NVDA not found' }],
      });

      const result = await tools.getTickerSnapshots(
        { symbols: ['NVDA'] },
        undefined,
        anonymous,
      );

      expect(marketData.getSnapshots).not.toHaveBeenCalled();
      expect(parse(result)).toEqual([
        { symbol: 'NVDA', error: 'Ticker NVDA not found' },
      ]);
    });

    it('signed-in: unchanged — every symbol goes to the snapshot path, ungated', async () => {
      await tools.getTickerSnapshots(
        { symbols: ['AAPL', 'NVDA'] },
        undefined,
        signedIn,
      );

      expect(tickers.partitionPublicRead).not.toHaveBeenCalled();
      expect(marketData.getSnapshots).toHaveBeenCalledWith(['AAPL', 'NVDA']);
    });
  });
});
