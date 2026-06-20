import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { MarketDataService } from '../../market-data/market-data.service';
import { MarketStatusService } from '../../market-data/market-status.service';
import { TickersService } from '../../tickers/tickers.service';
import { CurrencyService } from '../../currency/currency.service';
import { toolJson } from '../dto/serializers';

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
 */
@Injectable()
export class MarketDataTools {
  constructor(
    private readonly marketData: MarketDataService,
    private readonly marketStatus: MarketStatusService,
    private readonly tickers: TickersService,
    private readonly currency: CurrencyService,
  ) {}

  @Tool({
    name: 'get_ticker_snapshot',
    description:
      'Get a full market snapshot for one symbol: latest price, day change, ' +
      'company profile, key fundamentals and metrics. Use this for a complete ' +
      'point-in-time view of a single ticker.',
    parameters: z.object({ symbol }),
  })
  async getTickerSnapshot(args: { symbol: string }) {
    return toolJson(await this.marketData.getSnapshot(args.symbol));
  }

  @Tool({
    name: 'get_ticker_snapshots',
    description:
      'Get market snapshots for up to 100 symbols at once. Returns an array of ' +
      'snapshots. Prefer this over many single calls when comparing tickers.',
    parameters: z.object({
      symbols: z
        .array(symbol)
        .min(1)
        .max(100)
        .describe('List of ticker symbols (max 100).'),
    }),
  })
  async getTickerSnapshots(args: { symbols: string[] }) {
    return toolJson(await this.marketData.getSnapshots(args.symbols));
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
  async getTickerHistory(args: {
    symbol: string;
    interval: string;
    from: string;
    to: string;
  }) {
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
      'to also search external providers for symbols not yet in the local ' +
      'universe.',
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
  async getCompanyNews(args: { symbol: string; from?: string; to?: string }) {
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
