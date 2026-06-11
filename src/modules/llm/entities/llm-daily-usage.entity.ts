import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

/**
 * One row per UTC calendar day, tracking how many free-tier (primary-key)
 * Gemini flash-lite calls have been made. Backs the hard daily budget that
 * stops background/cron research before it exhausts the free quota and
 * escalates to the billed secondary key. DB-backed so the cap survives
 * Cloud Run instance restarts.
 */
@Entity('llm_daily_usage')
export class LlmDailyUsage {
  // UTC calendar date, formatted 'YYYY-MM-DD'.
  @PrimaryColumn({ type: 'date' })
  usage_date: string;

  // Free-tier flash-lite calls consumed on this date.
  @Column({ type: 'integer', default: 0 })
  count: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
