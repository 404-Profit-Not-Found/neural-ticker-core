import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from './entities/user.entity';
import { CreditTransaction } from './entities/credit-transaction.entity';

@Injectable()
export class CreditService {
  constructor(private readonly dataSource: DataSource) {}

  async getBalance(userId: string): Promise<number> {
    const user = await this.dataSource
      .getRepository(User)
      .findOneBy({ id: userId });
    return user ? user.credits_balance : 0;
  }

  getModelCost(model?: string): number {
    if (!model) return 1;
    const m = model.toLowerCase();

    // Exact mapping matches shown in UI image
    if (m.includes('pro') || m.includes('gpt-5')) return 5;
    if (
      m === 'gemini-3-flash-preview' ||
      m === 'gemini-3-flash' ||
      m === 'gemini-3.5-flash'
    )
      return 2;
    if (m.includes('mini') || m.includes('gpt-4') || m.includes('flash-lite'))
      return 1;

    // Unknown/unrecognized model → fail-expensive so a crafted model string
    // can't route to an expensive provider while being charged the minimum.
    return 5;
  }

  /**
   * Cost of a /research/ask run, derived from the SAME execution parameters the
   * pipeline actually uses (provider + quality). The previous code priced this
   * off a non-existent `model` body field, so every request resolved to cost 1
   * and the Pro gate never fired. `deep` (slow web-search model) and `ensemble`
   * (runs multiple providers) are the premium paths → cost 5, which also gates
   * free-tier users via CreditGuard (`cost > 1`).
   */
  getResearchCost(provider?: string, quality?: string): number {
    const q = (quality || '').toLowerCase();
    const p = (provider || '').toLowerCase();

    if (p === 'ensemble' || q === 'deep') return 5;
    return 1;
  }

  /**
   * Sum of positive credits a user has earned for a given reason since a
   * timestamp. Used to enforce daily anti-farming caps.
   */
  async getEarnedSince(
    userId: string,
    reason: string,
    since: Date,
  ): Promise<number> {
    const row = await this.dataSource
      .getRepository(CreditTransaction)
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'sum')
      .where('t.user_id = :userId', { userId })
      .andWhere('t.reason = :reason', { reason })
      .andWhere('t.amount > 0')
      .andWhere('t.created_at >= :since', { since })
      .getRawOne<{ sum: string }>();
    return Number(row?.sum) || 0;
  }

  async addCredits(
    userId: string,
    amount: number,
    reason: 'manual_contribution' | 'monthly_reset' | 'admin_gift',
    metadata?: Record<string, any>,
  ): Promise<User> {
    // Reject non-positive/NaN amounts so a bad caller can never silently
    // subtract credits (negative add) or write a zero-value transaction.
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Credit amount must be a positive number');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const userRepo = queryRunner.manager.getRepository(User);
      const txRepo = queryRunner.manager.getRepository(CreditTransaction);

      const user = await userRepo.findOneBy({ id: userId });
      if (!user) throw new BadRequestException('User not found');

      user.credits_balance += amount;
      await userRepo.save(user);

      const tx = txRepo.create({
        user_id: userId,
        amount,
        reason,
        metadata,
      });
      await txRepo.save(tx);

      await queryRunner.commitTransaction();
      return user;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Grant contribution-reward credits with the daily anti-farming cap enforced
   * ATOMICALLY inside a row-locked transaction (M8). Unlike {@link addCredits},
   * the cap check (sum of the last 24h `manual_contribution` credits) is
   * re-read while holding a `pessimistic_write` lock on the user row, so two
   * concurrent uploads can't both observe "under cap" and over-grant past it
   * (the TOCTOU the previous read-then-add pattern allowed). Returns the amount
   * actually granted — 0 when the cap is already reached (still commits so the
   * lock releases). `requestedAmount` is the rarity reward; it is clamped down
   * to whatever headroom remains under `dailyCap`.
   */
  async addContributionCredits(
    userId: string,
    requestedAmount: number,
    dailyCap: number,
    metadata?: Record<string, any>,
  ): Promise<number> {
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      throw new BadRequestException('Credit amount must be a positive number');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const userRepo = queryRunner.manager.getRepository(User);
      const txRepo = queryRunner.manager.getRepository(CreditTransaction);

      // Lock the user row FIRST. Under READ COMMITTED this serializes
      // concurrent contributions by the same user: the second caller blocks
      // here until the first commits, then re-reads a snapshot that includes
      // the first grant — so the cap can never be exceeded by a race.
      const user = await userRepo
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :id', { id: userId })
        .getOne();

      if (!user) throw new BadRequestException('User not found');

      // Re-read the rolling-24h earned total INSIDE the locked transaction.
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const row = await txRepo
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.amount), 0)', 'sum')
        .where('t.user_id = :userId', { userId })
        .andWhere('t.reason = :reason', { reason: 'manual_contribution' })
        .andWhere('t.amount > 0')
        .andWhere('t.created_at >= :since', { since })
        .getRawOne<{ sum: string }>();
      const earnedToday = Number(row?.sum) || 0;

      const grantable = Math.min(requestedAmount, dailyCap - earnedToday);
      if (grantable <= 0) {
        // Cap already reached — commit the (no-op) tx so the lock releases.
        await queryRunner.commitTransaction();
        return 0;
      }

      user.credits_balance += grantable;
      await userRepo.save(user);

      const tx = txRepo.create({
        user_id: userId,
        amount: grantable,
        reason: 'manual_contribution',
        metadata,
      });
      await txRepo.save(tx);

      await queryRunner.commitTransaction();
      return grantable;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async deductCredits(
    userId: string,
    amount: number,
    reason:
      | 'research_spend'
      | 'portfolio_analysis_spend'
      | 'social_analysis_spend',
    metadata?: Record<string, any>,
  ): Promise<User> {
    // A negative amount would INCREASE the balance and write a positive "spend"
    // transaction — reject it (and NaN/zero) so cost can only ever debit.
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        'Deduction amount must be a positive number',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const userRepo = queryRunner.manager.getRepository(User);
      const txRepo = queryRunner.manager.getRepository(CreditTransaction);

      // Lock the user row for update to prevent race conditions
      // In Postgres, we can use "Locking" but simple atomic update check is safer/simpler for now
      // Or select for update:
      const user = await userRepo
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :id', { id: userId })
        .getOne();

      if (!user) throw new BadRequestException('User not found');

      if (user.credits_balance < amount) {
        throw new BadRequestException('Insufficient credits');
      }

      user.credits_balance -= amount;
      await userRepo.save(user); // This line was removed in the provided snippet, but it's crucial. Re-adding it.

      const tx = txRepo.create({
        user_id: userId,
        amount: -amount, // Store as negative for spend
        reason,
        metadata,
      });
      await txRepo.save(tx);

      await queryRunner.commitTransaction();
      return user;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Resets credits to the tier cap if current date > reset_date
   * Logic typically triggered by Cron or Login interceptor
   */
  async checkAndResetCredits(): Promise<void> {
    // Basic implementation placeholder - logic can be complex
    // For now, AdminController will handle manual resets or gifts
  }
}
