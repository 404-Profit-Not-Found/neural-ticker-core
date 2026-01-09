import { Injectable, Logger, NotFoundException, HttpException, Inject, forwardRef, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TickerEntity } from './entities/ticker.entity';
import { TickerLogoEntity } from './entities/ticker-logo.entity';
import { FinnhubService } from '../finnhub/finnhub.service';
import { YahooFinanceService } from '../yahoo-finance/yahoo-finance.service';
import { JobsService } from '../jobs/jobs.service'; // Added
import { RequestType } from '../jobs/entities/request-queue.entity'; // Added
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class TickersService {
  private readonly logger = new Logger(TickersService.name);

  constructor(
    @InjectRepository(TickerEntity)
    private readonly tickerRepo: Repository<TickerEntity>,
    @InjectRepository(TickerLogoEntity)
    @InjectRepository(TickerLogoEntity)
    private readonly logoRepo: Repository<TickerLogoEntity>,
    @Inject(forwardRef(() => FinnhubService))
    private readonly finnhubService: FinnhubService,
    private readonly yahooFinanceService: YahooFinanceService,
    @Inject(forwardRef(() => JobsService)) // Added
    private readonly jobsService: JobsService, // Added
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
        this.logger.warn(
          `Finnhub returned no profile for ${upperSymbol}, trying Yahoo Finance fallback...`,
        );
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
        this.logger.warn(
          `Finnhub restricted access for ${upperSymbol}, trying Yahoo Finance fallback...`,
        );
        profile = await this.fetchFromYahoo(upperSymbol);
        source = 'yahoo';
      } else {
        this.logger.error(
          `Finnhub fetch error for ${upperSymbol}: ${error.message}`,
        );
        // Final fallback try
        profile = await this.fetchFromYahoo(upperSymbol).catch(async e => {
             const msg = (e.message || '').toLowerCase();
             const statusText = (e.statusText || '').toLowerCase();
             const fullErrorString = JSON.stringify(e).toLowerCase();
             
             this.logger.warn(`Yahoo Error for ${upperSymbol}: ${e.message}`);

             const isRateLimit = 
                (e instanceof HttpException && e.getStatus() === 429) || 
                e.status === 429 || 
                msg.includes('rate limit') || 
                msg.includes('too many requests') || 
                msg.includes('429') ||
                msg.includes('status 429') ||
                msg.includes('crumb') ||  // Catch "Failed to get crumb" even without 429
                msg.includes('cookie') ||
                statusText.includes('too many requests') ||
                fullErrorString.includes('too many requests') ||
                fullErrorString.includes('429');
             
             if (isRateLimit) {
                  this.logger.warn(`Rate limit hit for ${upperSymbol}, queueing for background retry.`);
                  await this.jobsService.queueRequest(RequestType.ADD_TICKER, { symbol: upperSymbol });
                  throw new HttpException({ message: 'Ticker addition queued', status: 'QUEUED' }, HttpStatus.ACCEPTED);
             }
             
             if (e instanceof HttpException) {
                 throw e;
             }

             // Log unknown errors but return null (swallow) so we can proceed to 'tick not found' logic or just fail safely
             this.logger.error(`Unexpected Yahoo fallback error for ${upperSymbol}: ${e.message}`);
             return null;
        });
        source = 'yahoo';
      }
    }

    if (!profile) {
      throw new NotFoundException(
        `Ticker ${upperSymbol} not found in any provider`,
      );
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

  async searchTickers(search?: string): Promise<Partial<TickerEntity & { is_locally_tracked: boolean }>[]> {
    if (!search || search.trim() === '') {
      const all = await this.getAllTickers();
      return all.map(t => ({ ...t, is_locally_tracked: true }));
    }

    const searchPattern = `${search.toUpperCase()}%`;
    
    // 1. Local DB Search
    const dbResults = await this.tickerRepo
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
      .orderBy('CASE WHEN UPPER(ticker.symbol) = :exact THEN 1 ELSE 2 END', 'ASC')
      .addOrderBy('ticker.symbol', 'ASC')
      .setParameter('exact', search.toUpperCase())
      .limit(20)
      .getMany();

    const mappedDbResults = dbResults.map(t => ({...t, is_locally_tracked: true}));

    // 2. External Search (Fallback/Supplement)
    if (search.length >= 2) {
      try {
        const extData = await this.finnhubService.searchSymbols(search);
        if (extData && extData.result && Array.isArray(extData.result)) {
          const existingSymbols = new Set(mappedDbResults.map((t) => t.symbol.toUpperCase()));
          
          const extResults = extData.result
            .filter((item: any) => !existingSymbols.has(item.symbol.toUpperCase()))
            .slice(0, 10)
            .map((item: any) => ({
              symbol: item.symbol,
              name: item.description,
              exchange: item.type || 'External',
              logo_url: null,
              is_locally_tracked: false,
            }));
            
          return [...mappedDbResults, ...extResults];
        }
      } catch (err) {
        this.logger.error(`Finnhub search failed: ${err.message}`);
      }
    }

    return mappedDbResults;
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

  async updateLogo(symbol: string, logoUrl: string): Promise<TickerEntity> {
    const ticker = await this.tickerRepo.findOne({
      where: { symbol: symbol.toUpperCase() },
    });
    if (!ticker) {
      throw new NotFoundException(`Ticker ${symbol} not found`);
    }

    ticker.logo_url = logoUrl;
    const saved = await this.tickerRepo.save(ticker);

    // Trigger download in background
    if (logoUrl) {
      this.downloadAndSaveLogo(saved.id, logoUrl).catch((err) =>
        this.logger.error(
          `Failed to download logo for ${saved.symbol}: ${err.message}`,
        ),
      );
    }

    return saved;
  }

  async getHiddenTickers(): Promise<Partial<TickerEntity>[]> {
    return this.tickerRepo.find({
      select: ['id', 'symbol', 'name', 'exchange', 'is_hidden'],
      where: { is_hidden: true },
      order: { symbol: 'ASC' },
    });
  }

  async searchTickersAdmin(
    search?: string,
    missingLogo?: boolean,
  ): Promise<Partial<TickerEntity>[]> {
    const query = this.tickerRepo
      .createQueryBuilder('ticker')
      .select([
        'ticker.id',
        'ticker.symbol',
        'ticker.name',
        'ticker.exchange',
        'ticker.is_hidden',
        'ticker.logo_url',
      ])
      .orderBy('ticker.symbol', 'ASC')
      .limit(50);

    // Filter by missing logo if requested
    if (missingLogo) {
      query.andWhere(
        '(ticker.logo_url IS NULL OR ticker.logo_url = :empty OR ticker.logo_url = :broken)',
        { empty: '', broken: 'null' }, // Sometimes string 'null' gets saved
      );
    }

    // Apply search calculation if provided
    if (search && search.trim() !== '') {
      const searchPattern = `${search.toUpperCase()}%`;
      query.andWhere(
        '(UPPER(ticker.symbol) LIKE :pattern OR UPPER(ticker.name) LIKE :pattern)',
        { pattern: searchPattern },
      );
    } else if (!missingLogo) {
      // If no search AND no missingLogo filter, just return basic list
      // But we already set up the query, just need to limit it.
      // The default behavior before was:
      // if (!search) return this.tickerRepo.find(...)
      // We can replicate that efficiency or just use the query builder we started.
      // Query builder is fine.
    }

    return query.getMany();
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
      // Use catch() on individual calls to avoid total failure if one module is missing (common for international/OTC)
      const summary = await this.yahooFinanceService.getSummary(symbol).catch((err) => {
        if (err.message && (
            err.message.toLowerCase().includes('429') || 
            err.message.toLowerCase().includes('too many requests') || 
            err.message.toLowerCase().includes('crumb') ||
            err.message.toLowerCase().includes('cookie')
        )) {
           throw new HttpException('Yahoo Finance Rate Limit Exceeded (Summary).', 429);
        }
        this.logger.warn(`Yahoo Summary failed for ${symbol}: ${err.message}`);
        return null;
      });
      const quote = await this.yahooFinanceService.getQuote(symbol).catch((err) => {
        if (err.message && (
            err.message.toLowerCase().includes('429') || 
            err.message.toLowerCase().includes('too many requests') ||
            err.message.toLowerCase().includes('crumb') ||
            err.message.toLowerCase().includes('cookie')
        )) {
           throw new HttpException('Yahoo Finance Rate Limit Exceeded (Quote).', 429);
        }
        this.logger.warn(`Yahoo Quote failed for ${symbol}: ${err.message}`);
        return null; // Return null to continue if just quote fails
      });

      if (!summary && !quote) {
        this.logger.warn(`Both Yahoo summary and quote failed for ${symbol}`);
        return null;
      }

      // Map to a common format similar to Finnhub profile
      // We prioritize any available data
      return {
        name:
          quote?.longName ||
          quote?.shortName ||
          summary?.summaryProfile?.longName ||
          symbol,
        exchange: quote?.fullExchangeName || quote?.exchange || 'External',
        currency: quote?.currency || 'USD',
        country: summary?.summaryProfile?.country || 'Unknown',
        ipo: null,
        marketCapitalization:
          quote?.marketCap || summary?.defaultKeyStatistics?.marketCap || summary?.defaultKeyStatistics?.enterpriseValue,
        shareOutstanding: summary?.defaultKeyStatistics?.sharesOutstanding,
        phone: summary?.summaryProfile?.phone,
        weburl: summary?.summaryProfile?.website,
        logo: null,
        finnhubIndustry: summary?.summaryProfile?.industry || summary?.summaryProfile?.sector,
        sector: summary?.summaryProfile?.sector,
        description: summary?.summaryProfile?.longBusinessSummary,
      };
    } catch (e) {
      if (e instanceof HttpException) throw e; // Propagate rate limits
      this.logger.error(`Unexpected Yahoo fallback error for ${symbol}: ${e.message}`);
      return null;
    }
  }
}
