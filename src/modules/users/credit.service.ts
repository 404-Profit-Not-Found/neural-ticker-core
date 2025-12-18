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
    if (m === 'gemini-3-flash-preview' || m === 'gemini-3-flash') return 2;
    if (m.includes('mini') || m.includes('gpt-4') || m.includes('flash-lite'))
      return 1;

    return 1;
  }

  async addCredits(
    userId: string,
    amount: number,
    reason: 'manual_contribution' | 'monthly_reset' | 'admin_gift',
    metadata?: Record<string, any>,
  ): Promise<User> {
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

  async deductCredits(
    userId: string,
    amount: number,
    reason: 'research_spend' | 'portfolio_analysis_spend',
    metadata?: Record<string, any>,
  ): Promise<User> {
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
