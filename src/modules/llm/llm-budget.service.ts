import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmDailyUsage } from './entities/llm-daily-usage.entity';

/**
 * Hard, DB-backed daily budget for free-tier (primary-key) Gemini flash-lite
 * calls. Background/cron research checks this before queueing work and stops
 * once the cap is reached, so it never exhausts the free quota and escalates
 * to the billed secondary key. DB-backed so the cap survives instance restarts
 * and is shared across concurrent Cloud Run instances.
 */
@Injectable()
export class LlmBudgetService {
  private readonly logger = new Logger(LlmBudgetService.name);

  constructor(
    @InjectRepository(LlmDailyUsage)
    private readonly usageRepo: Repository<LlmDailyUsage>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Daily cap on free-tier flash-lite calls. Kept safely below Google's real
   * 500/day free quota so background work stops with margin to spare (the
   * margin also absorbs the few hours of skew between UTC day boundaries and
   * Google's Pacific quota reset).
   */
  getDailyLimit(): number {
    return this.configService.get<number>('llm.dailyFreeLimit') ?? 450;
  }

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Atomically records `count` consumed free-tier calls for today.
   * Accounting must never break an in-flight LLM call, so failures are
   * logged and swallowed rather than thrown.
   */
  async record(count = 1): Promise<void> {
    if (count <= 0) return;
    try {
      await this.usageRepo.query(
        `INSERT INTO "llm_daily_usage" ("usage_date", "count", "updated_at")
         VALUES ($1, $2, NOW())
         ON CONFLICT ("usage_date")
         DO UPDATE SET "count" = "llm_daily_usage"."count" + EXCLUDED."count",
                       "updated_at" = NOW()`,
        [this.todayKey(), count],
      );
    } catch (err: any) {
      this.logger.warn(`Failed to record LLM usage: ${err.message}`);
    }
  }

  /** Free-tier calls already consumed today. */
  async getUsageToday(): Promise<number> {
    const row = await this.usageRepo.findOne({
      where: { usage_date: this.todayKey() },
    });
    return row?.count ?? 0;
  }

  /** Free-tier calls still available today (never negative). */
  async getRemaining(): Promise<number> {
    const used = await this.getUsageToday();
    return Math.max(0, this.getDailyLimit() - used);
  }

  /** Whether at least `need` free-tier calls remain today. */
  async hasBudget(need = 1): Promise<boolean> {
    return (await this.getRemaining()) >= need;
  }
}
