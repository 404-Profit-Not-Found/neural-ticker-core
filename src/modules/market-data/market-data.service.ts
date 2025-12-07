import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { ConfigService } from '@nestjs/config'; // Added
import { PriceOhlcv } from './entities/price-ohlcv.entity';
import { Fundamentals } from './entities/fundamentals.entity';
import { TickersService } from '../tickers/tickers.service';
import { FinnhubService } from '../finnhub/finnhub.service';

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);

  constructor(
    @InjectRepository(PriceOhlcv)
    private readonly ohlcvRepo: Repository<PriceOhlcv>,
    @InjectRepository(Fundamentals)
    private readonly fundamentalsRepo: Repository<Fundamentals>,
    private readonly tickersService: TickersService,
    private readonly finnhubService: FinnhubService,
    private readonly configService: ConfigService, // Added
  ) {}

  async getSnapshot(symbol: string) {
    const tickerEntity = await this.tickersService.awaitEnsureTicker(symbol);

    // Configurable stale thresholds
    const MARKET_DATA_STALE_MINUTES = this.configService.get<number>(
      'marketData.stalePriceMinutes',
      15,
    );
    const FUNDAMENTALS_STALE_HOURS = this.configService.get<number>(
      'marketData.staleFundamentalsHours',
      24,
    );

    // Fetch latest candle from DB
    let latestCandle = await this.ohlcvRepo.findOne({
      where: { symbol_id: tickerEntity.id },
      order: { ts: 'DESC' },
    });

    // Fetch fundamentals from DB
    let fundamentals = await this.fundamentalsRepo.findOne({
      where: { symbol_id: tickerEntity.id },
    });

    const isPriceStale =
      !latestCandle ||
      Date.now() - latestCandle.ts.getTime() >
        MARKET_DATA_STALE_MINUTES * 60 * 1000;
    const isFundamentalsStale =
      !fundamentals ||
      Date.now() - fundamentals.updated_at.getTime() >
        FUNDAMENTALS_STALE_HOURS * 60 * 60 * 1000;

    let source = 'database';

    if (isPriceStale || isFundamentalsStale) {
      this.logger.log(
        `Data stale for ${symbol} (Price: ${isPriceStale}, Fundamentals: ${isFundamentalsStale}). Fetching from Finnhub...`,
      );
      try {
        const [quote, profile] = await Promise.all([
          this.finnhubService.getQuote(symbol),
          this.finnhubService.getCompanyProfile(symbol), // Refresh profile too for fundamentals
        ]);

        source = 'finnhub';

        // Function to save quote as OHLCV
        if (quote) {
          const newCandle = this.ohlcvRepo.create({
            symbol_id: tickerEntity.id,
            ts: new Date(quote.t * 1000), // Finnhub sends unix timestamp in seconds
            timeframe: '1d', // Storing daily snapshot as '1d' for simplified history integration? Or 'snapshot'? utilizing '1d' as per common practice for "current day" or "latest" if market open.
            // Important: Finnhub Quote endpoint returns Current Price (c), High (h), Low (l), Open (o), Previous Close (pc).
            // We map these to our OHLCV.
            open: quote.o,
            high: quote.h,
            low: quote.l,
            close: quote.c,
            volume: 0, // Quote doesn't return volume usually, only candles do.
            source: 'finnhub_quote',
          });
          // Upsert (ignore if exists for this timeframe+ts)
          await this.ohlcvRepo
            .save(newCandle)
            .catch((e) =>
              this.logger.warn(`Failed to save candle: ${e.message}`),
            );
          latestCandle = newCandle;
        }

        // Function to save Fundamentals
        if (profile) {
          // Determine Fundamentals values from profile or other endpoints?
          // The current SymbolEntity stores profile info. Fundamentals entity has specific financial metrics
          // like PE, EPS which Finnhub Company Profile 2 provides?
          // Finnhub "Company Profile 2" (which we use) returns: marketCapitalization, shareOutstanding.
          // It does NOT typically return PE/EPS/DivYield/Beta in that specific endpoint (those are in "Basic Financials").
          // WITHOUT changing FinnhubService to add a new call for "Basic Financials", we can only update what we have.
          // For now, we update what matches our Fundamentals entity from what we have in Profile, or leave null.

          // Existing FinnhubService.getCompanyProfile calls /stock/profile2.
          // Response: country, currency, exchange, name, ticker, ipo, marketCapitalization, shareOutstanding, logo, phone, weburl, finnhubIndustry.

          // Our Fundamentals Entity has: market_cap, pe_ttm, eps_ttm, dividend_yield, beta, debt_to_equity.
          // We can map marketCapitalization. shareOutstanding is on SymbolEntity.

          const newFundamentals = this.fundamentalsRepo.create({
            symbol_id: tickerEntity.id,
            market_cap: profile.marketCapitalization,
            // pe_ttm: ??? (Need separate API call)
            // eps_ttm: ???
            // beta: ???
            updated_at: new Date(),
          });
          await this.fundamentalsRepo.save(newFundamentals);
          fundamentals = newFundamentals;
        }
      } catch (error) {
        this.logger.error(
          `Failed to refresh data for ${symbol}: ${error.message}`,
        );
        // Fallback to what we have (even if stale)
      }
    }

    return {
      ticker: tickerEntity,
      latestPrice: latestCandle,
      fundamentals,
      source,
    };
  }

  async getHistory(
    symbol: string,
    interval: string,
    fromStr: string,
    toStr: string,
  ) {
    const tickerEntity = await this.tickersService.getTicker(symbol);

    // Basic date parsing, assuming ISO or unix timestamp from QS
    const from = new Date(fromStr);
    const to = new Date(toStr);

    return this.ohlcvRepo.find({
      where: {
        symbol_id: tickerEntity.id,
        timeframe: interval, // Assuming interval matches timeframe enums/strings
        ts: Between(from, to),
      },
      order: { ts: 'ASC' },
    });
  }
}
