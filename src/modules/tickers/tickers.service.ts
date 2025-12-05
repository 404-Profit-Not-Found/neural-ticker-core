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
    const entity = await this.tickerRepo.findOne({
      where: { symbol: symbol.toUpperCase() },
    });
    if (!entity) {
      throw new NotFoundException(`Ticker ${symbol} not found`);
    }
    return entity;
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

    this.logger.log(
      `Ticker ${upperSymbol} not found, fetching from Finnhub...`,
    );
    const profile = await this.finnhubService.getCompanyProfile(upperSymbol);

    // If Finnhub returns empty object or error logic needs handling
    if (!profile || Object.keys(profile).length === 0) {
      this.logger.warn(`Finnhub returned no profile for ${upperSymbol}`);
      // Depending on business logic, might still create a placeholder or throw
      // For now, assume if valid symbol Finnhub returns something.
      // If empty, throw NotFound
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
