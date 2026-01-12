import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TickerRequestEntity } from './entities/ticker-request.entity';
import { TickersService } from '../tickers/tickers.service';

@Injectable()
export class TickerRequestsService {
  constructor(
    @InjectRepository(TickerRequestEntity)
    private readonly requestRepo: Repository<TickerRequestEntity>,
    private readonly tickersService: TickersService,
  ) {}

  async createRequest(userId: string, symbol: string) {
    const startSymbol = symbol.trim().toUpperCase();

    // 1. Check if already tracked
    const existing = await this.tickersService.findOneBySymbol(startSymbol);
    if (existing) {
      throw new BadRequestException(
        `Ticker ${startSymbol} is already tracked.`,
      );
    }

    // 2. Check if pending request exists for this user (or globally? User specific avoids spam, global avoids dupes. Let's do user specific for now to allow multiple people to vote/request)
    // Actually, if someone else requested it, we might just want to return that.
    // Let's prevent duplicate pending requests for the SAME symbol regardless of user to keep DB clean,
    // OR allow multiple to show "demand". Plan didn't specify.
    // Implementation: Prevent duplicate pending requests for the SAME symbol globally to keep it simple.

    const existingRequest = await this.requestRepo.findOne({
      where: { symbol: startSymbol, status: 'PENDING' },
    });

    if (existingRequest) {
      // Just return the existing one, effectively "upvoting" logic could go here later
      return existingRequest;
    }

    const request = this.requestRepo.create({
      user_id: userId,
      symbol: startSymbol,
      status: 'PENDING',
    });

    return this.requestRepo.save(request);
  }

  async getRequests() {
    return this.requestRepo.find({
      order: { created_at: 'DESC' },
      relations: ['user'],
    });
  }

  async approveRequest(id: string) {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');

    if (request.status === 'APPROVED') return request;

    // Ensure ticker (this fetches from Finnhub/Yahoo and saves to DB)
    try {
      await this.tickersService.ensureTicker(request.symbol);
      request.status = 'APPROVED';
      return this.requestRepo.save(request);
    } catch (e) {
      // If ensure fails (e.g. invalid symbol), maybe REJECT?
      throw new BadRequestException(`Failed to add ticker: ${e.message}`);
    }
  }

  async rejectRequest(id: string) {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');

    request.status = 'REJECTED';
    return this.requestRepo.save(request);
  }
  async onModuleInit() {
    // DEBUG: Auto-seed VWS.CO request if missing
    // Commented out to ensure backend stability during diagnosis of 500 errors
    /*
    try {
      const symbol = 'VWS.CO';
      const existingRequest = await this.requestRepo.findOne({ where: { symbol } });
      const existingTicker = await this.tickersService.findOneBySymbol(symbol);
      
      if (!existingRequest && !existingTicker) {
        // Find a valid user to assign this request to
        const result = await this.requestRepo.manager.query('SELECT id FROM users LIMIT 1');
        const userId = result[0]?.id;

        if (userId) {
            console.log(`[DEBUG] Seeding missing request for ${symbol} for user ${userId}`);
            await this.requestRepo.save(this.requestRepo.create({
                user_id: userId,
                symbol,
                status: 'PENDING',
            }));
        } else {
            console.warn('[DEBUG] Cannot seed request: No users found in DB');
        }
      }
    } catch (e) {
      console.error('[DEBUG] Failed to seed request', e);
    }
    */
  }
}
