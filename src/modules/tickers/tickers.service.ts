import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TickerEntity } from './entities/ticker.entity';
import { TickerLogoEntity } from './entities/ticker-logo.entity';
import { FinnhubService } from '../finnhub/finnhub.service';
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
    private readonly httpService: HttpService,
  ) {}

  async getTicker(symbol: string): Promise<TickerEntity> {
    // If not in DB, try to fetch from Finnhub via ensureTicker
    return this.ensureTicker(symbol);
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
    try {
      this.logger.log(
        `Ticker ${upperSymbol} not found, fetching from Finnhub...`,
      );
      profile = await this.finnhubService.getCompanyProfile(upperSymbol);
    } catch (error) {
      if (error.response?.status === 429) {
        this.logger.warn(
          `Finnhub Rate Limit Exceeded for ${upperSymbol}. Retrying later suggested.`,
        );
        throw new NotFoundException(
          `Ticker ${upperSymbol} could not be verified due to rate limits. Please try again later.`,
        );
      }
      this.logger.error(
        `Finnhub fetch failed for ${upperSymbol}: ${error.message}`,
      );
      // Fallback: throw NotFound to be consistent with "lazy load failed"
      throw new NotFoundException(
        `Ticker ${upperSymbol} not found or external API unavailable`,
      );
    }

    // If Finnhub returns empty object or error logic needs handling
    if (!profile || Object.keys(profile).length === 0) {
      this.logger.warn(`Finnhub returned no profile for ${upperSymbol}`);
      throw new NotFoundException(
        `Ticker ${upperSymbol} details not found in Finnhub`,
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
      finnhub_raw: profile,
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

  async getLogo(symbol: string): Promise<TickerLogoEntity | null> {
    const ticker = await this.tickerRepo.findOne({
      where: { symbol: symbol.toUpperCase() },
    });
    if (!ticker) return null;

    return this.logoRepo.findOne({ where: { symbol_id: ticker.id } });
  }

  async getCount(): Promise<number> {
    return this.tickerRepo.count();
  }

  async getAllTickers(): Promise<Partial<TickerEntity>[]> {
    return this.tickerRepo.find({
      select: ['symbol', 'name', 'exchange'],
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
      .where('UPPER(ticker.symbol) LIKE :pattern', { pattern: searchPattern })
      .orWhere('UPPER(ticker.name) LIKE :pattern', { pattern: searchPattern })
      .orderBy('ticker.symbol', 'ASC')
      .limit(20)
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
}
