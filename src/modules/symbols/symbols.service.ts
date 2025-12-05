import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SymbolEntity } from './entities/symbol.entity';
import { FinnhubService } from '../finnhub/finnhub.service';

@Injectable()
export class SymbolsService {
  private readonly logger = new Logger(SymbolsService.name);

  constructor(
    @InjectRepository(SymbolEntity)
    private readonly symbolRepo: Repository<SymbolEntity>,
    private readonly finnhubService: FinnhubService,
  ) {}

  async getSymbol(symbol: string): Promise<SymbolEntity> {
    const entity = await this.symbolRepo.findOne({ where: { symbol: symbol.toUpperCase() } });
    if (!entity) {
      throw new NotFoundException(`Symbol ${symbol} not found`);
    }
    return entity;
  }

  // Alias for backward compatibility if needed, or primarily used by other services
  async awaitEnsureSymbol(symbol: string): Promise<SymbolEntity> {
      return this.ensureSymbol(symbol);
  }

  async ensureSymbol(symbol: string): Promise<SymbolEntity> {
    const upperSymbol = symbol.toUpperCase();
    const existing = await this.symbolRepo.findOne({ where: { symbol: upperSymbol } });
    if (existing) {
      return existing;
    }

    this.logger.log(`Symbol ${upperSymbol} not found, fetching from Finnhub...`);
    const profile = await this.finnhubService.getCompanyProfile(upperSymbol);
    
    // If Finnhub returns empty object or error logic needs handling
    if (!profile || Object.keys(profile).length === 0) {
       this.logger.warn(`Finnhub returned no profile for ${upperSymbol}`);
       // Depending on business logic, might still create a placeholder or throw
       // For now, assume if valid symbol Finnhub returns something. 
       // If empty, throw NotFound
       throw new NotFoundException(`Symbol ${upperSymbol} details not found in Finnhub`);
    }

    const newSymbol = this.symbolRepo.create({
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

    return this.symbolRepo.save(newSymbol);
  }
}
