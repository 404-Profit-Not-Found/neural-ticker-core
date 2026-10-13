import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { MarketDataService } from '../../market-data/market-data.service';
import { MarketStatusService } from '../../market-data/market-status.service';
import { TickersService } from '../../tickers/tickers.service';
import { CurrencyService } from '../../currency/currency.service';
import { toolJson } from '../dto/serializers';
import { getMcpUser } from '../auth/mcp-user.util';

const symbol = z
  .string()
  .trim()
  .min(1)
  .describe('Ticker symbol, e.g. "AAPL"')
  .transform((s) => s.toUpperCase());

const dateStr = z
  .string()
  .trim()
  .min(1)
  .describe('Date as YYYY-MM-DD (or ISO 8601)');

/**
 * Anonymous market-data, search and currency tools. No authentication
 * required — these expose public market information.
 *
 * "Public" means READING what the platform already tracks. The snapshot,
 * history and news reads resolve their symbol through
 * TickersService.ensureTicker(), which for an untracked symbol asks the data
 * providers, inserts the ticker and starts its initialisation (history sync +
 * an LLM research run). An anonymous caller must never trigger that, so those
 * tools pass through the same gate as the public HTTP routes
 * (TickersService.assertPublicReadAllowed): anonymous + untracked symbol is a
 * "not found" tool error. A caller with a valid token is not gated.
 */
@Injectable()
export class MarketDataTools {
  constructor(
    private readonly marketData: MarketDataService,
    private readonly marketStatus: MarketStatusService,
    private readonly tickers: TickersService,
    private readonly currency: CurrencyService,
  ) {}

  /** Throws the tool's "not found" error for an anonymous caller asking for a
   *  symbol we do not track. A signed-in caller is not gated. */
  private async gateAnonymousRead(symbol: string, req: any): Promise<void> {
    if (getMcpUser(req)) return;
    await this.tickers.assertPublicReadAllowed(symbol, false);
  }

  @Tool({
    name: 'get_ticker_snapshot',
    description:
      'Get a full market snapshot for one symbol: latest price, day change, ' +
      'company profile, key fundamentals and metrics. Use this for a complete ' +
      'point-in-time view of a single ticker. Without authentication only ' +
      'tickers already tracked on the platform are available.',
    parameters: z.object({ symbol }),
  })
  async getTickerSnapshot(args: { symbol: string }, _ctx: unknown, req: any) {
    await this.gateAnonymousRead(args.symbol, req);
    return toolJson(await this.marketData.getSnapshot(args.symbol));
  }

  @Tool({
    name: 'get_ticker_snapshots',
    description:
      'Get market snapshots for up to 100 symbols at once. Returns an array of ' +
      'snapshots. Prefer this over many single calls when comparing tickers. ' +
      'Without authentication only tickers already tracked on the platform ' +
      'are returned; the others come back as { symbol, error } entries.',
    parameters: z.object({
      symbols: z
        .array(symbol)
        .min(1)
        .max(100)
        .describe('List of ticker symbols (max 100).'),
    }),
  })
  async getTickerSnapshots(
    args: { symbols: string[] },
    _ctx: unknown,
    req: any,
  ) {
    if (getMcpUser(req)) {
      return toolJson(await this.marketData.getSnapshots(args.symbols));
    }

    // Anonymous: serve the tracked symbols, and answer the rest with the same
    // per-symbol { symbol, error } entry a failed snapshot produces — without
    // ever handing them to the snapshot path (which would create them).
    const { readable, refused } = await this.tickers.partitionPublicRead(
      args.symbols,
      false,
    );
    const served = readable.length
      ? await this.marketData.getSnapshots(readable)
      : [];
    return toolJson([...served, ...refused]);
  }

  @Tool({
    name: 'get_ticker_history',
    description:
      'Get historical OHLCV candles for a symbol over a date range. Intraday ' +
      'intervals (1m/5m/15m/1h) are limited to recent ranges by the data ' +
      'provider; use 1d/1wk/1mo for longer history.',
    parameters: z.object({
      symbol,
      interval: z
        .enum(['1m', '5m', '15m', '1h', '1d', '1wk', '1mo'])
        .default('1d')
        .describe('Candle interval. Defaults to 1d.'),
      from: dateStr.describe('Range start, YYYY-MM-DD.'),
      to: dateStr.describe('Range end, YYYY-MM-DD.'),
    }),
  })
  async getTickerHistory(
    args: {
      symbol: string;
      interval: string;
      from: string;
      to: string;
    },
    _ctx: unknown,
    req: any,
  ) {
    await this.gateAnonymousRead(args.symbol, req);
    return toolJson(
      await this.marketData.getHistory(
        args.symbol,
        args.interval,
        args.from,
        args.to,
      ),
    );
  }

  @Tool({
    name: 'get_quote',
    description:
      'Get a lightweight real-time quote (current price and day OHLC) for a ' +
      'symbol. Faster/cheaper than a full snapshot when you only need price.',
    parameters: z.object({ symbol }),
  })
  async getQuote(args: { symbol: string }) {
    return toolJson(await this.marketData.getQuote(args.symbol));
  }

  @Tool({
    name: 'search_tickers',
    description:
      'Search for tickers by symbol or company name. Set includeExternal=true ' +
      'to also discover symbols not yet on the platform (via Finnhub/Yahoo) — ' +
      'i.e. to see what is available to add. Each result carries ' +
      'is_locally_tracked: true (already tracked) or false (not yet — add it ' +
      'with request_ticker, or add_ticker as admin); is_queued=true means an ' +
      'add request is already pending.',
    parameters: z.object({
      query: z
        .string()
        .trim()
        .optional()
        .describe('Symbol or company-name fragment to search for.'),
      includeExternal: z
        .boolean()
        .default(false)
        .describe('Also search external providers. Defaults to false.'),
    }),
  })
  async searchTickers(args: { query?: string; includeExternal: boolean }) {
    return toolJson(
      await this.tickers.searchTickers(args.query, args.includeExternal),
    );
  }

  @Tool({
    name: 'get_company_news',
    description:
      'Get recent company-specific news headlines for a symbol, optionally ' +
      'bounded by a from/to date range.',
    parameters: z.object({
      symbol,
      from: dateStr.optional().describe('Optional start date, YYYY-MM-DD.'),
      to: dateStr.optional().describe('Optional end date, YYYY-MM-DD.'),
    }),
  })
  async getCompanyNews(
    args: { symbol: string; from?: string; to?: string },
    _ctx: unknown,
    req: any,
  ) {
    await this.gateAnonymousRead(args.symbol, req);
    return toolJson(
      await this.marketData.getCompanyNews(args.symbol, args.from, args.to),
    );
  }

  @Tool({
    name: 'get_general_news',
    description: 'Get general / market-wide financial news headlines.',
    parameters: z.object({}),
  })
  async getGeneralNews() {
    return toolJson(await this.marketData.getGeneralNews());
  }

  @Tool({
    name: 'get_market_status',
    description:
      'Get the open/closed status of the major equity markets (exchanges), ' +
      'including session and next open/close where available.',
    parameters: z.object({}),
  })
  async getMarketStatus() {
    return toolJson(await this.marketStatus.getAllMarketsStatus());
  }

  @Tool({
    name: 'convert_currency',
    description:
      'Convert an amount from one ISO 4217 currency to another using the ' +
      'latest exchange rate. Returns the converted amount and the rate used.',
    parameters: z.object({
      amount: z.number().describe('Amount to convert.'),
      from: z
        .string()
        .trim()
        .length(3)
        .describe('Source currency code, e.g. "USD".')
        .transform((s) => s.toUpperCase()),
      to: z
        .string()
        .trim()
        .length(3)
        .describe('Target currency code, e.g. "EUR".')
        .transform((s) => s.toUpperCase()),
    }),
  })
  async convertCurrency(args: { amount: number; from: string; to: string }) {
    const rate = await this.currency.getRate(args.from, args.to);
    if (rate === null) {
      throw new Error(
        `Exchange rate unavailable for ${args.from} -> ${args.to}.`,
      );
    }
    return toolJson({
      amount: args.amount,
      from: args.from,
      to: args.to,
      rate,
      converted: args.amount * rate,
    });
  }
}
