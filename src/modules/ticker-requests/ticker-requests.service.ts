import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TickerRequestEntity } from './entities/ticker-request.entity';
import { TickersService } from '../tickers/tickers.service';

@Injectable()
export class TickerRequestsService {
  private readonly logger = new Logger(TickerRequestsService.name);

  constructor(
    @InjectRepository(TickerRequestEntity)
    private readonly requestRepo: Repository<TickerRequestEntity>,
    private readonly tickersService: TickersService,
  ) {}

  async createRequest(userId: string, symbol: string) {
    const startSymbol = symbol.trim().toUpperCase();
    this.logger.log(`Received request for ${startSymbol} from user ${userId}`);

    try {
      // 1. Check if already tracked
      const existing = await this.tickersService.findOneBySymbol(startSymbol);
      if (existing) {
        this.logger.warn(
          `Ticker ${startSymbol} already exists. Returning conflict.`,
        );
        throw new BadRequestException(
          `Ticker ${startSymbol} is currently being tracked. You can search for it now.`,
        );
      }

      // 2. Check for duplicate pending request for this specific symbol (Global or User?)
      // We check globally for PENDING to avoid clutter? Or User?
      // Existing logic was global. Let's keep it but handle potential errors.
      const existingRequest = await this.requestRepo.findOne({
        where: { symbol: startSymbol, status: 'PENDING' },
      });

      if (existingRequest) {
        this.logger.log(`Pending request already exists for ${startSymbol}`);
        return existingRequest;
      }

      // 3. Create request
      // Guard against potential unique constraint on (user_id, symbol) if the user requested it before (REJECTED/APPROVED)
      const userRequest = await this.requestRepo.findOne({
        where: { user_id: userId, symbol: startSymbol },
      });

      if (userRequest) {
        // If they have an old request, we might want to revive it or just return it?
        // If REJECTED, maybe they can request again?
        // For now, let's update status to PENDING if it was REJECTED?
        // Or just return it to avoid unique violation.
        if (userRequest.status !== 'PENDING') {
          this.logger.log(
            `Updating existing ${userRequest.status} request for ${startSymbol} to PENDING`,
          );
          userRequest.status = 'PENDING';
          return this.requestRepo.save(userRequest);
        }
        return userRequest;
      }

      const request = this.requestRepo.create({
        user_id: userId,
        symbol: startSymbol,
        status: 'PENDING',
      });

      return await this.requestRepo.save(request);
    } catch (error) {
      this.logger.error(
        `Failed to create request for ${startSymbol}: ${error.message}`,
        error.stack,
      );
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        'Failed to submit request. Please try again.',
      );
    }
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
