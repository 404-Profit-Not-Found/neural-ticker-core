import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TickerEntity } from './entities/ticker.entity';
import { FinnhubService } from '../finnhub/finnhub.service';

@Injectable()
export class TickersService {
  private readonly logger = new Logger(TickersService.name);

  constructor(
    @InjectRepository(TickerEntity)
    private readonly tickerRepo: Repository<TickerEntity>,
    private readonly finnhubService: FinnhubService,
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

    return this.tickerRepo.save(newTicker);
  }

  async getAllTickers(): Promise<Partial<TickerEntity>[]> {
    return this.tickerRepo.find({
      select: ['symbol', 'name', 'exchange'],
      order: { symbol: 'ASC' },
    });
  }
}
