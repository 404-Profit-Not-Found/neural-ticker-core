import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TickerEntity } from './entities/ticker.entity';
import { TickerLogoEntity } from './entities/ticker-logo.entity';
import { FinnhubService } from '../finnhub/finnhub.service';
import { YahooFinanceService } from '../yahoo-finance/yahoo-finance.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class TickersService {
  private readonly logger = new Logger(TickersService.name);

  constructor(
    @InjectRepository(TickerEntity)
    private readonly tickerRepo: Repository<TickerEntity>,
    @InjectRepository(TickerLogoEntity)
    private readonly logoRepo: Repository<TickerLogoEntity>,
    private readonly finnhubService: FinnhubService,
    private readonly yahooFinanceService: YahooFinanceService,
    private readonly httpService: HttpService,
  ) {}

  async getTicker(symbol: string, isAdmin = false): Promise<TickerEntity> {
    // If not in DB, try to fetch from Finnhub via ensureTicker
    const ticker = await this.ensureTicker(symbol);
    if (!isAdmin && ticker.is_hidden) {
      throw new NotFoundException(`Ticker ${symbol} not found`);
    }
    return ticker;
  }

  // Alias for backward compatibility if needed, or primarily used by other services
  async awaitEnsureTicker(symbol: string): Promise<TickerEntity> {
    return this.ensureTicker(symbol);
  }

  async ensureTicker(symbol: string): Promise<TickerEntity> {
    const upperSymbol = symbol.toUpperCase();
    const existing = await this.tickerRepo.findOne({
      where: { symbol: upperSymbol },
    });
    if (existing) {
      // Trigger background logo download if missing, just in case
      if (existing.logo_url && !existing.logo_url.startsWith('http')) {
        // Assume if it's not http, it might be already processed or invalid?
        // Actually we want to check if we have it in logoRepo
        void this.checkAndDownloadLogo(existing);
      } else if (existing.logo_url) {
        void this.checkAndDownloadLogo(existing);
      }
      return existing;
    }

    let profile;
    let source = 'finnhub';

    try {
      this.logger.log(
        `Ticker ${upperSymbol} not found, fetching from Finnhub...`,
      );
      profile = await this.finnhubService.getCompanyProfile(upperSymbol);
      
      // If Finnhub returns empty object or null, it's a "not found" or "restricted" case for us
      if (!profile || Object.keys(profile).length === 0) {
        this.logger.warn(`Finnhub returned no profile for ${upperSymbol}, trying Yahoo Finance fallback...`);
        profile = await this.fetchFromYahoo(upperSymbol);
        source = 'yahoo';
      }
    } catch (error) {
      const status = error.response?.status;
      if (status === 429) {
        this.logger.warn(`Finnhub Rate Limit Exceeded for ${upperSymbol}.`);
        throw new NotFoundException(`Ticker ${upperSymbol} rate limited.`);
      }

      if (status === 401 || status === 403) {
        this.logger.warn(`Finnhub restricted access for ${upperSymbol}, trying Yahoo Finance fallback...`);
        profile = await this.fetchFromYahoo(upperSymbol);
        source = 'yahoo';
      } else {
        this.logger.error(`Finnhub fetch error for ${upperSymbol}: ${error.message}`);
        // Final fallback try
        profile = await this.fetchFromYahoo(upperSymbol);
        source = 'yahoo';
      }
    }

    if (!profile) {
      throw new NotFoundException(`Ticker ${upperSymbol} not found in any provider`);
    }

    const newTicker = this.tickerRepo.create({
      symbol: upperSymbol,
      name: profile.name || upperSymbol,
      exchange: profile.exchange || 'Unknown',
      currency: profile.currency || 'USD',
      country: profile.country || 'Unknown',
      ipo_date: profile.ipo,
      market_capitalization: profile.marketCapitalization,
      share_outstanding: profile.shareOutstanding,
      phone: profile.phone,
      web_url: profile.weburl,
      logo_url: profile.logo,
      finnhub_industry: profile.finnhubIndustry,
      sector: profile.finnhubIndustry || profile.sector, 
      description: profile.description,
      finnhub_raw: source === 'finnhub' ? profile : { yahoo_fallback: profile },
    });

    const savedTicker = await this.tickerRepo.save(newTicker);

    // Download logo in background
    if (savedTicker.logo_url) {
      this.downloadAndSaveLogo(savedTicker.id, savedTicker.logo_url).catch(
        (err) =>
          this.logger.error(
            `Failed to download logo for ${savedTicker.symbol}: ${err.message}`,
          ),
      );
    }

    return savedTicker;
  }

  private async checkAndDownloadLogo(ticker: TickerEntity) {
    // Non-blocking check
    try {
      const exists = await this.logoRepo.findOne({
        where: { symbol_id: ticker.id },
      });
      if (!exists && ticker.logo_url) {
        void this.downloadAndSaveLogo(ticker.id, ticker.logo_url);
      }
    } catch (e) {
      this.logger.error(
        `Error checking logo for ${ticker.symbol}: ${e.message}`,
      );
    }
  }

  async downloadAndSaveLogo(symbolId: string, url: string) {
    if (!url) return;
    try {
      this.logger.debug(
        `Downloading logo for ticker ID ${symbolId} from ${url}`,
      );
      const response = await firstValueFrom(
        this.httpService.get(url, { responseType: 'arraybuffer' }),
      );

      const buffer = Buffer.from(response.data);
      const mimeType = response.headers['content-type'] || 'image/png';

      const logo = this.logoRepo.create({
        symbol_id: symbolId,
        image_data: buffer,
        mime_type: mimeType,
      });

      await this.logoRepo.save(logo);
      this.logger.log(`Saved logo for ticker ID ${symbolId}`);
    } catch (error) {
      this.logger.error(
        `Failed to download logo from ${url}: ${error.message}`,
      );
    }
  }

  async getLogo(
    symbol: string,
    isAdmin = false,
  ): Promise<TickerLogoEntity | null> {
    const ticker = await this.tickerRepo.findOne({
      where: { symbol: symbol.toUpperCase() },
    });
    if (!ticker || (!isAdmin && ticker.is_hidden)) return null;

    return this.logoRepo.findOne({ where: { symbol_id: ticker.id } });
  }

  async getCount(): Promise<number> {
    return this.tickerRepo.count();
  }

  async getAllTickers(): Promise<Partial<TickerEntity>[]> {
    return this.tickerRepo.find({
      select: ['symbol', 'name', 'exchange'],
      where: { is_hidden: false },
      order: { symbol: 'ASC' },
    });
  }

  async searchTickers(search?: string): Promise<Partial<TickerEntity>[]> {
    if (!search || search.trim() === '') {
      return this.getAllTickers();
    }

    const searchPattern = `${search.toUpperCase()}%`;
    return this.tickerRepo
      .createQueryBuilder('ticker')
      .select([
        'ticker.symbol',
        'ticker.name',
        'ticker.exchange',
        'ticker.logo_url',
      ])
      .where('ticker.is_hidden = :hidden', { hidden: false })
      .andWhere(
        '(UPPER(ticker.symbol) LIKE :pattern OR UPPER(ticker.name) LIKE :pattern)',
        { pattern: searchPattern },
      )
      .orderBy('ticker.symbol', 'ASC')
      .limit(20)
      .getMany();
  }

  async getSymbolsByIds(ids: string[] | number[]): Promise<string[]> {
    if (!ids || ids.length === 0) return [];

    const tickers = await this.tickerRepo
      .createQueryBuilder('ticker')
      .select('ticker.symbol')
      .where('ticker.id IN (:...ids)', { ids })
      .getMany();

    return tickers.map((t) => t.symbol);
  }

  getRepo(): Repository<TickerEntity> {
    return this.tickerRepo;
  }

  // Admin: Shadow ban management
  async setTickerHidden(
    symbol: string,
    hidden: boolean,
  ): Promise<TickerEntity> {
    const ticker = await this.tickerRepo.findOne({
      where: { symbol: symbol.toUpperCase() },
    });
    if (!ticker) {
      throw new NotFoundException(`Ticker ${symbol} not found`);
    }
    ticker.is_hidden = hidden;
    return this.tickerRepo.save(ticker);
  }

  async getHiddenTickers(): Promise<Partial<TickerEntity>[]> {
    return this.tickerRepo.find({
      select: ['id', 'symbol', 'name', 'exchange', 'is_hidden'],
      where: { is_hidden: true },
      order: { symbol: 'ASC' },
    });
  }

  async searchTickersAdmin(search?: string): Promise<Partial<TickerEntity>[]> {
    // Admin search includes hidden tickers
    if (!search || search.trim() === '') {
      return this.tickerRepo.find({
        select: ['id', 'symbol', 'name', 'exchange', 'is_hidden'],
        order: { symbol: 'ASC' },
        take: 50,
      });
    }

    const searchPattern = `${search.toUpperCase()}%`;
    return this.tickerRepo
      .createQueryBuilder('ticker')
      .select([
        'ticker.id',
        'ticker.symbol',
        'ticker.name',
        'ticker.exchange',
        'ticker.is_hidden',
      ])
      .where(
        '(UPPER(ticker.symbol) LIKE :pattern OR UPPER(ticker.name) LIKE :pattern)',
        { pattern: searchPattern },
      )
      .orderBy('ticker.symbol', 'ASC')
      .limit(50)
      .getMany();
  }

  async getUniqueSectors(): Promise<string[]> {
    // 1. Try to get distinct 'sector' column
    // 2. Fallback to 'finnhub_industry' if sector is null/empty
    // We can just query both or coalesce.
    // Given the current state where `sector` might be null but `finnhub_industry` is populated:
    const results = await this.tickerRepo
      .createQueryBuilder('ticker')
      .select(
        "DISTINCT COALESCE(NULLIF(ticker.sector, ''), ticker.finnhub_industry)",
        'sector',
      )
      .where('ticker.sector IS NOT NULL OR ticker.finnhub_industry IS NOT NULL')
      .andWhere("ticker.sector != '' OR ticker.finnhub_industry != ''")
      .orderBy('sector', 'ASC') // sort by the alias
      .getRawMany();

    return results.map((r) => r.sector).filter((s) => s && s.trim().length > 0);
  }

  private async fetchFromYahoo(symbol: string): Promise<any> {
    try {
      this.logger.log(`Fetching ${symbol} from Yahoo Finance...`);
      const summary = await this.yahooFinanceService.getSummary(symbol);
      const quote = await this.yahooFinanceService.getQuote(symbol);

      if (!summary && !quote) return null;

      // Map to a common format similar to Finnhub profile
      return {
        name: quote?.longName || quote?.shortName || summary?.summaryProfile?.longName,
        exchange: quote?.fullExchangeName || 'Yahoo Finance',
        currency: quote?.currency || 'USD',
        country: summary?.summaryProfile?.country || 'Unknown',
        ipo: null, // Yahoo doesn't explicitly provide this in easy field
        marketCapitalization: quote?.marketCap || summary?.defaultKeyStatistics?.enterpriseValue,
        shareOutstanding: summary?.defaultKeyStatistics?.sharesOutstanding,
        phone: summary?.summaryProfile?.phone,
        weburl: summary?.summaryProfile?.website,
        logo: null, // Yahoo doesn't provide easy logo URL
        finnhubIndustry: summary?.summaryProfile?.industry,
        sector: summary?.summaryProfile?.sector,
        description: summary?.summaryProfile?.longBusinessSummary,
      };
    } catch (e) {
      this.logger.error(`Yahoo fallback failed for ${symbol}: ${e.message}`);
      return null;
    }
  }
}
