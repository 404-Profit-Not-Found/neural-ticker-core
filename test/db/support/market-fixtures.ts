import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MarketDataService } from '../../../src/modules/market-data/market-data.service';
import { MarketStatusService } from '../../../src/modules/market-data/market-status.service';
import { PriceOhlcv } from '../../../src/modules/market-data/entities/price-ohlcv.entity';
import { Fundamentals } from '../../../src/modules/market-data/entities/fundamentals.entity';
import { AnalystRating } from '../../../src/modules/market-data/entities/analyst-rating.entity';
import { CompanyNews } from '../../../src/modules/market-data/entities/company-news.entity';
import { RiskAnalysis } from '../../../src/modules/risk-reward/entities/risk-analysis.entity';
import { ResearchNote } from '../../../src/modules/research/entities/research-note.entity';
import { Comment } from '../../../src/modules/social/entities/comment.entity';
import { TickerEntity } from '../../../src/modules/tickers/entities/ticker.entity';
import { TickersService } from '../../../src/modules/tickers/tickers.service';
import { FinnhubService } from '../../../src/modules/finnhub/finnhub.service';
import { YahooFinanceService } from '../../../src/modules/yahoo-finance/yahoo-finance.service';
import { PortfolioService } from '../../../src/modules/portfolio/portfolio.service';
import { PriceAlertsService } from '../../../src/modules/price-alerts/price-alerts.service';
import { appDataSourceOptions } from './test-db';
import type { RatingCase } from '../../support/rating-cases';

/**
 * The REAL MarketDataService on the test database: real repositories, real
 * query builder, real SQL. Only what would leave the process (data providers)
 * or belongs to another module is stubbed.
 */
export async function createMarketDataService(): Promise<{
  service: MarketDataService;
  ds: DataSource;
  close: () => Promise<void>;
}> {
  const module = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({ ...appDataSourceOptions(), migrations: [] }),
      TypeOrmModule.forFeature([
        PriceOhlcv,
        Fundamentals,
        AnalystRating,
        RiskAnalysis,
        ResearchNote,
        Comment,
        CompanyNews,
        TickerEntity,
      ]),
    ],
    providers: [
      MarketDataService,
      {
        provide: TickersService,
        inject: [DataSource],
        useFactory: (ds: DataSource) => {
          const repo = ds.getRepository(TickerEntity);
          const find = (symbol: string) =>
            repo.findOneOrFail({ where: { symbol: symbol.toUpperCase() } });
          return {
            getRepo: () => repo,
            // Reads only: nothing in this suite may create a ticker.
            awaitEnsureTicker: find,
            ensureTicker: find,
            getTicker: find,
          };
        },
      },
      // No data provider is reachable from here: "no company news".
      {
        provide: FinnhubService,
        useValue: { getCompanyNews: () => Promise.resolve([]) },
      },
      {
        provide: YahooFinanceService,
        useValue: { search: () => Promise.resolve({ news: [] }) },
      },
      {
        provide: ConfigService,
        useValue: { get: (_key: string, fallback?: unknown) => fallback },
      },
      { provide: MarketStatusService, useValue: {} },
      { provide: PortfolioService, useValue: {} },
      { provide: PriceAlertsService, useValue: {} },
    ],
  })
    .setLogger(false as any)
    .compile();

  return {
    service: module.get(MarketDataService),
    ds: module.get(DataSource),
    close: () => module.close(),
  };
}

export interface SeedTicker {
  symbol: string;
  name?: string;
  exchange?: string;
  is_hidden?: boolean;
  news_sentiment?: string | null;
  news_impact_score?: number | null;
  /** Latest daily candle; omit for a ticker without any price. */
  price?: { close: number; prevClose?: number | null } | null;
  /** Omit for a ticker without a fundamentals row. */
  fundamentals?: Record<string, number | string | null> | null;
  /** Omit for a ticker that has never been analysed. */
  risk?: {
    financial_risk: number;
    overall_score: number;
    upside_percent?: number;
    base?: number | null;
    bear?: number | null;
    bull?: number | null;
  } | null;
}

/** Inserts one ticker with whatever it has. Returns the ticker id. */
export async function seedTicker(
  ds: DataSource,
  t: SeedTicker,
): Promise<string> {
  const [{ id }] = await ds.query(
    `INSERT INTO tickers (symbol, name, exchange, currency, country, is_hidden,
                          news_sentiment, news_impact_score)
     VALUES ($1, $2, $3, 'USD', 'US', $4, $5, $6) RETURNING id`,
    [
      t.symbol,
      t.name ?? `${t.symbol} Inc`,
      t.exchange ?? 'NASDAQ',
      t.is_hidden ?? false,
      t.news_sentiment ?? null,
      t.news_impact_score ?? null,
    ],
  );

  if (t.price) {
    await ds.query(
      `INSERT INTO price_ohlcv (symbol_id, ts, timeframe, open, high, low, close, "prevClose", volume, source)
       VALUES ($1, now(), '1d', $2, $2, $2, $2, $3, 1000, 'test')`,
      [id, t.price.close, t.price.prevClose ?? null],
    );
  }

  if (t.fundamentals) {
    const columns = Object.keys(t.fundamentals);
    await ds.query(
      `INSERT INTO fundamentals (symbol_id${columns.map((c) => `, "${c}"`).join('')})
       VALUES ($1${columns.map((_, i) => `, $${i + 2}`).join('')})`,
      [id, ...columns.map((c) => t.fundamentals![c])],
    );
  }

  if (t.risk) {
    const [{ id: analysisId }] = await ds.query(
      `INSERT INTO risk_analyses
         (ticker_id, overall_score, financial_risk, execution_risk, dilution_risk,
          competitive_risk, regulatory_risk, time_horizon_years,
          price_target_weighted, upside_percent, fundamentals)
       VALUES ($1, $2, $3, 5, 5, 5, 5, 1, 0, $4, '{}') RETURNING id`,
      [
        id,
        t.risk.overall_score,
        t.risk.financial_risk,
        t.risk.upside_percent ?? 0,
      ],
    );
    for (const type of ['bull', 'base', 'bear'] as const) {
      const mid = t.risk[type];
      if (mid === null || mid === undefined) continue;
      await ds.query(
        `INSERT INTO risk_scenarios
           (analysis_id, scenario_type, probability, description, price_low,
            price_high, price_mid, expected_market_cap, key_drivers)
         VALUES ($1, $2, 0.33, '', $3, $3, $3, 0, '[]')`,
        [analysisId, type, mid],
      );
    }
  }
  return id;
}

/**
 * Inserts rating test cases (test/support/rating-cases.ts) as tickers named
 * `<prefix>0001`, `<prefix>0002`, … in one transaction. Returns the symbols,
 * in the order of the cases.
 */
export async function seedRatingCases(
  ds: DataSource,
  cases: RatingCase[],
  prefix = 'RC',
): Promise<string[]> {
  const symbols = cases.map(
    (_, i) => `${prefix}${String(i + 1).padStart(4, '0')}`,
  );
  await ds.transaction(async (manager) => {
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      await seedTicker(manager as unknown as DataSource, {
        symbol: symbols[i],
        name: c.name,
        news_sentiment: c.news_sentiment,
        news_impact_score: c.news_impact_score,
        price: c.close === null ? null : { close: c.close, prevClose: null },
        fundamentals: c.fundamentals,
        risk: c.analysis,
      });
    }
  });
  return symbols;
}

/** One price_ohlcv row. */
export async function seedCandle(
  ds: DataSource,
  tickerId: string,
  candle: {
    ts: Date;
    timeframe: string;
    close: number;
    prevClose?: number | null;
    source?: string;
  },
): Promise<void> {
  await ds.query(
    `INSERT INTO price_ohlcv (symbol_id, ts, timeframe, open, high, low, close, "prevClose", volume, source)
     VALUES ($1, $2, $3, $4, $4, $4, $4, $5, 1000, $6)`,
    [
      tickerId,
      candle.ts,
      candle.timeframe,
      candle.close,
      candle.prevClose ?? null,
      candle.source ?? 'test',
    ],
  );
}
