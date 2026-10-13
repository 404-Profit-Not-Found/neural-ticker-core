import { DataSource } from 'typeorm';
import { MarketDataService } from '../../src/modules/market-data/market-data.service';
import { PortfolioService } from '../../src/modules/portfolio/portfolio.service';
import { PortfolioPosition } from '../../src/modules/portfolio/entities/portfolio-position.entity';
import { RiskAnalysis } from '../../src/modules/risk-reward/entities/risk-analysis.entity';
import { TickerDetailController } from '../../src/modules/tickers/ticker-detail.controller';
import { tickerVerdict } from '../../src/lib/ticker-verdict';
import { describeDb, ensureMigrated, truncateAll } from './support/test-db';
import {
  createMarketDataService,
  seedCandle,
  seedTicker,
} from './support/market-fixtures';

/**
 * "Current price" = the close of the newest DAILY candle; "previous close" =
 * that candle's prevClose.
 *
 * price_ohlcv also holds the intraday candles the 1D / 1W / 1M charts cache.
 * They are stamped during the day — later than the day's daily candle (UTC
 * midnight) — and carry no prevClose, so "the newest row of any timeframe"
 * made the last 5-minute bar the ticker's price everywhere, with a day change
 * of 0 %, after anyone had opened its intraday chart (seen locally: KO
 * 71.25 → 90.68, 0.00 %).
 */
describeDb(
  'latest price is the daily close, whatever else is in price_ohlcv (real PostgreSQL)',
  () => {
    let service: MarketDataService;
    let ds: DataSource;
    let close: () => Promise<void>;
    let userId: string;

    const DAY = 24 * 60 * 60 * 1000;
    const midnight = (offsetDays: number) => {
      const d = new Date(Date.now() + offsetDays * DAY);
      return new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
      );
    };
    const today = midnight(0);
    const DAILY_CLOSE = 71.25;
    const PREV_CLOSE = 70;
    const CHANGE = ((DAILY_CLOSE - PREV_CLOSE) / PREV_CLOSE) * 100;
    const INTRADAY_CLOSE = 90.68;

    const analysis = {
      financial_risk: 4,
      overall_score: 7,
      upside_percent: 10,
      base: 85,
      bear: 60,
    };
    const fundamentals = {
      consensus_rating: 'Buy',
      pe_ttm: 22,
      revenue_ttm: 47000000000,
      fifty_two_week_high: 74,
      fifty_two_week_low: 58,
    };

    beforeAll(async () => {
      await ensureMigrated();
      ({ service, ds, close } = await createMarketDataService());
      await truncateAll(ds);

      // KO: two daily candles, then intraday bars cached by a chart view today.
      const ko = await seedTicker(ds, {
        symbol: 'KO',
        fundamentals,
        risk: analysis,
      });
      await seedCandle(ds, ko, {
        ts: midnight(-1),
        timeframe: '1d',
        close: PREV_CLOSE,
        prevClose: 69,
      });
      await seedCandle(ds, ko, {
        ts: today,
        timeframe: '1d',
        close: DAILY_CLOSE,
        prevClose: PREV_CLOSE,
      });
      for (let i = 0; i < 6; i++) {
        await seedCandle(ds, ko, {
          ts: new Date(today.getTime() + (14 * 60 + i * 5) * 60 * 1000),
          timeframe: '5m',
          close: i === 5 ? INTRADAY_CLOSE : 90 + i / 10,
          source: 'yahoo_intraday',
        });
      }
      await seedCandle(ds, ko, {
        ts: new Date(today.getTime() + 15 * 60 * 60 * 1000),
        timeframe: '1h',
        close: 91.5,
        source: 'yahoo_intraday',
      });
      // …and an intraday bar at the very timestamp of the daily candle: the old
      // "ts = MAX(ts)" join returned BOTH rows, i.e. the ticker twice.
      await seedCandle(ds, ko, {
        ts: today,
        timeframe: '5m',
        close: 88,
        source: 'yahoo_intraday',
      });

      // A control ticker that only ever had daily candles.
      const pep = await seedTicker(ds, {
        symbol: 'PEP',
        fundamentals,
        risk: analysis,
      });
      await seedCandle(ds, pep, {
        ts: today,
        timeframe: '1d',
        close: 150,
        prevClose: 148,
      });

      const [{ id }] = await ds.query(
        `INSERT INTO users (email, nickname) VALUES ('holder@example.test', 'holder') RETURNING id`,
      );
      userId = id;
      await ds.query(
        `INSERT INTO portfolio_positions (user_id, symbol, shares, buy_price, buy_date, currency)
       VALUES ($1, 'KO', 10, 60, '2026-01-02', 'USD')`,
        [userId],
      );
    });

    afterAll(async () => {
      await close?.();
    });

    const expectedRating = tickerVerdict({
      close: DAILY_CLOSE,
      analysis: {
        ...analysis,
        base_price: analysis.base,
        bear_price: analysis.bear,
      },
      fundamentals,
    });

    it('the intraday bars are there, and newer than the daily candle', async () => {
      const [{ newest_timeframe }] = await ds.query(
        `SELECT timeframe AS newest_timeframe FROM price_ohlcv p JOIN tickers t ON t.id = p.symbol_id
        WHERE t.symbol = 'KO' ORDER BY ts DESC LIMIT 1`,
      );
      expect(newest_timeframe).toBe('1h');
    });

    it('analyzer: the daily close, the change vs the previous daily close, one row per ticker', async () => {
      const page = await service.getAnalyzerTickers({
        sortBy: 'symbol',
        sortDir: 'ASC',
      });

      expect(page.items.map((i: any) => i.ticker.symbol)).toEqual([
        'KO',
        'PEP',
      ]);
      expect(page.meta.total).toBe(2);
      const ko: any = page.items[0];
      expect(ko.latestPrice.close).toBe(DAILY_CLOSE);
      expect(ko.latestPrice.prevClose).toBe(PREV_CLOSE);
      expect(ko.latestPrice.timeframe).toBe('1d');
      expect(ko.latestPrice.change).toBeCloseTo(CHANGE, 10);
      // The rating was computed from the daily close too.
      expect(ko.aiAnalysis.rating).toBe(expectedRating.rating);
      expect(ko.aiAnalysis.rating_score).toBe(expectedRating.score);
    });

    it('analyzer: sorting by price and by change uses the daily candle', async () => {
      const byClose = await service.getAnalyzerTickers({
        sortBy: 'close',
        sortDir: 'DESC',
      });
      expect(byClose.items.map((i: any) => i.ticker.symbol)).toEqual([
        'PEP',
        'KO',
      ]);
      const byChange = await service.getAnalyzerTickers({
        sortBy: 'change',
        sortDir: 'DESC',
      });
      // KO +1.79 %, PEP +1.35 %
      expect(byChange.items.map((i: any) => i.ticker.symbol)).toEqual([
        'KO',
        'PEP',
      ]);
    });

    it('snapshots: the daily close and its previous close', async () => {
      const [ko]: any[] = await service.getSnapshots(['KO']);

      expect(ko.latestPrice.close).toBe(DAILY_CLOSE);
      expect(ko.latestPrice.prevClose).toBe(PREV_CLOSE);
      expect(ko.latestPrice.timeframe).toBe('1d');
      expect(ko.aiAnalysis.rating_score).toBe(expectedRating.score);
    });

    it('composite: price and change_percent from the daily candle', async () => {
      // The single-ticker path would refresh from the data providers first;
      // keep it on what is stored.
      jest
        .spyOn(service, 'getSnapshot')
        .mockImplementation((symbol: string) =>
          (service as any).performGetSnapshot(symbol, { updateIfStale: false }),
        );
      jest.spyOn(service, 'getHistory').mockResolvedValue([] as any);
      jest.spyOn(service, 'getAnalystRatings').mockResolvedValue([] as any);
      const controller = new TickerDetailController(
        { assertPublicReadAllowed: () => Promise.resolve() } as any,
        service,
        {
          getLatestAnalysis: (tickerId: string) =>
            ds.getRepository(RiskAnalysis).findOne({
              where: { ticker_id: tickerId },
              order: { created_at: 'DESC' },
              relations: ['scenarios'],
            }),
        } as any,
        { getLatestNoteForTicker: () => Promise.resolve(null) } as any,
      );

      const composite: any = await controller.getCompositeData('KO', {
        user: { id: userId },
      });

      expect(composite.market_data.price).toBe(DAILY_CLOSE);
      expect(composite.market_data.change_percent).toBeCloseTo(CHANGE, 10);
      expect(composite.risk_analysis.rating_score).toBe(expectedRating.score);
    });

    it('portfolio: the position is valued at the daily close, with the day change', async () => {
      const portfolio = new PortfolioService(
        ds.getRepository(PortfolioPosition),
        {} as any,
        {} as any,
        service,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      const [position] = await portfolio.findAll(userId);

      expect(position.symbol).toBe('KO');
      expect(position.current_price).toBe(DAILY_CLOSE);
      expect(position.change_percent).toBeCloseTo(CHANGE, 10);
      expect(position.current_value).toBeCloseTo(10 * DAILY_CLOSE, 10);
      expect(position.gain_loss).toBeCloseTo(10 * (DAILY_CLOSE - 60), 10);
    });

    it('the dashboard counters rate the ticker from the daily close', async () => {
      const strongBuy = (await service.getStrongBuyCount()).symbols;
      const sell = (await service.getSellCount()).symbols;

      expect(strongBuy.includes('KO')).toBe(
        expectedRating.rating === 'Strong Buy',
      );
      expect(sell.includes('KO')).toBe(expectedRating.rating === 'Sell');
      // …and would not have been the same from the intraday price.
      const fromIntraday = tickerVerdict({
        close: 91.5,
        analysis: {
          ...analysis,
          base_price: analysis.base,
          bear_price: analysis.bear,
        },
        fundamentals,
      });
      expect(fromIntraday.score).not.toBe(expectedRating.score);
    });

    it('nothing was cleaned up: the intraday bars stay available to the charts', async () => {
      const rows: { timeframe: string; n: number }[] = await ds.query(
        `SELECT timeframe, count(*)::int AS n FROM price_ohlcv p JOIN tickers t ON t.id = p.symbol_id
        WHERE t.symbol = 'KO' GROUP BY timeframe ORDER BY timeframe`,
      );
      expect(rows).toEqual([
        { timeframe: '1d', n: 2 },
        { timeframe: '1h', n: 1 },
        { timeframe: '5m', n: 7 },
      ]);
    });
  },
);
