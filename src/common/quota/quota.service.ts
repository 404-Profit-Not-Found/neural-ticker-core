import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';

export type QuotaResource =
  | 'watchlists'
  | 'watchlistItems'
  | 'portfolioPositions'
  | 'priceAlerts';

@Injectable()
export class QuotaService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // Per-tier resource caps. The 'pro' value also applies to the 'whale' tier.
  private static readonly LIMITS: Record<
    QuotaResource,
    { free: number; pro: number }
  > = {
    watchlists: { free: 5, pro: 25 },
    watchlistItems: { free: 50, pro: 250 },
    portfolioPositions: { free: 50, pro: 500 },
    priceAlerts: { free: 20, pro: 100 },
  };

  private static readonly LABELS: Record<QuotaResource, string> = {
    watchlists: 'watchlists',
    watchlistItems: 'items in this watchlist',
    portfolioPositions: 'portfolio positions',
    priceAlerts: 'price alerts',
  };

  /**
   * Throws ForbiddenException when the user is already at/over the cap for the
   * given resource. Admins are unbounded; 'free' gets the smaller cap, 'pro'
   * and 'whale' get the larger one.
   */
  async assertWithinLimit(
    userId: string,
    resource: QuotaResource,
    currentCount: number,
  ): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (user?.role === 'admin') return;

    const tier = !user?.tier || user.tier === 'free' ? 'free' : 'pro';
    const max = QuotaService.LIMITS[resource][tier];
    if (currentCount >= max) {
      throw new ForbiddenException(
        `You've reached your limit of ${max} ${QuotaService.LABELS[resource]} on the ${tier} tier.`,
      );
    }
  }
}
