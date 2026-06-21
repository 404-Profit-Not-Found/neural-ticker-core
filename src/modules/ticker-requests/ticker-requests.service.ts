import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
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

  static readonly DAILY_REQUEST_LIMIT = 20;

  async createRequest(userId: string, symbol: string) {
    const startSymbol = (symbol || '').trim().toUpperCase();
    if (!/^[A-Z0-9.-]{1,10}$/.test(startSymbol)) {
      throw new BadRequestException('Invalid ticker symbol format');
    }
    this.logger.log(`Received request for ${startSymbol} from user ${userId}`);

    try {
      // Serialize this user's concurrent requests with a per-user advisory lock
      // so the daily-cap count below can't be raced past by parallel calls.
      return await this.requestRepo.manager.transaction(async (tx) => {
        const repo = tx.getRepository(TickerRequestEntity);
        await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `ticker-request:${userId}`,
        ]);

        // Per-user daily cap (anti-spam). Distinct arbitrary symbols would
        // otherwise let one user create unbounded request rows.
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const dailyCount = await repo.count({
          where: { user_id: userId, created_at: MoreThanOrEqual(since) },
        });
        if (dailyCount >= TickerRequestsService.DAILY_REQUEST_LIMIT) {
          throw new BadRequestException(
            `Daily ticker-request limit reached (${TickerRequestsService.DAILY_REQUEST_LIMIT}). Try again tomorrow.`,
          );
        }

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

        // 2. Check for duplicate pending request for this specific symbol (global).
        const existingRequest = await repo.findOne({
          where: { symbol: startSymbol, status: 'PENDING' },
        });

        if (existingRequest) {
          this.logger.log(`Pending request already exists for ${startSymbol}`);
          return existingRequest;
        }

        // 3. Create request
        // Guard against unique constraint on (user_id, symbol) if the user
        // requested it before (REJECTED/APPROVED) — revive instead of inserting.
        const userRequest = await repo.findOne({
          where: { user_id: userId, symbol: startSymbol },
        });

        if (userRequest) {
          if (userRequest.status !== 'PENDING') {
            this.logger.log(
              `Updating existing ${userRequest.status} request for ${startSymbol} to PENDING`,
            );
            userRequest.status = 'PENDING';
            return repo.save(userRequest);
          }
          return userRequest;
        }

        const request = repo.create({
          user_id: userId,
          symbol: startSymbol,
          status: 'PENDING',
        });

        return await repo.save(request);
      });
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

  /**
   * Admin convenience: add a ticker in one step — ensure it exists
   * (Finnhub → Yahoo) and record an APPROVED request row for the audit trail.
   * Unlike {@link createRequest} this bypasses the per-user daily cap and the
   * "already tracked" guard (re-adding an existing ticker is a no-op), since an
   * admin add is a deliberate action rather than a community request.
   */
  async adminAddTicker(adminUserId: string, symbol: string) {
    const sym = (symbol || '').trim().toUpperCase();
    if (!/^[A-Z0-9.-]{1,10}$/.test(sym)) {
      throw new BadRequestException('Invalid ticker symbol format');
    }

    // Fetch + persist the ticker. Idempotent: returns the existing row if
    // already tracked. May throw NotFoundException (unknown/rate-limited) or a
    // 202 ACCEPTED HttpException when the add was queued for a background retry.
    await this.tickersService.ensureTicker(sym);

    // Record an APPROVED request for the audit trail, deduping on (user,symbol)
    // to respect the unique constraint and avoid piling up rows on re-adds.
    let request = await this.requestRepo.findOne({
      where: { user_id: adminUserId, symbol: sym },
    });
    if (request) {
      request.status = 'APPROVED';
    } else {
      request = this.requestRepo.create({
        user_id: adminUserId,
        symbol: sym,
        status: 'APPROVED',
      });
    }
    return this.requestRepo.save(request);
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
