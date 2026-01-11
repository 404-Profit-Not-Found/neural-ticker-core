import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingColumnsToProduction1734640000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tickers Table additions
    await queryRunner.query(
      `ALTER TABLE "tickers" ADD COLUMN IF NOT EXISTS "finnhub_raw" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickers" ADD COLUMN IF NOT EXISTS "news_summary" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickers" ADD COLUMN IF NOT EXISTS "news_sentiment" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickers" ADD COLUMN IF NOT EXISTS "news_impact_score" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickers" ADD COLUMN IF NOT EXISTS "last_news_update" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickers" ADD COLUMN IF NOT EXISTS "is_hidden" boolean NOT NULL DEFAULT false`,
    );

    // Fundamentals Table additions
    await queryRunner.query(
      `ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "yahoo_metadata" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "consensus_rating" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "next_earnings_date" date`,
    );
    await queryRunner.query(
      `ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "next_earnings_estimate_eps" numeric(10,4)`,
    );
    await queryRunner.query(
      `ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "fifty_two_week_high" numeric(18,4)`,
    );
    await queryRunner.query(
      `ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "fifty_two_week_low" numeric(18,4)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Down migrations are optional but good practice
    await queryRunner.query(
      `ALTER TABLE "tickers" DROP COLUMN IF EXISTS "news_summary"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickers" DROP COLUMN IF EXISTS "news_sentiment"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickers" DROP COLUMN IF EXISTS "news_impact_score"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickers" DROP COLUMN IF EXISTS "last_news_update"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickers" DROP COLUMN IF EXISTS "finnhub_raw"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickers" DROP COLUMN IF EXISTS "is_hidden"`,
    );

    await queryRunner.query(
      `ALTER TABLE "fundamentals" DROP COLUMN IF EXISTS "yahoo_metadata"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fundamentals" DROP COLUMN IF EXISTS "consensus_rating"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fundamentals" DROP COLUMN IF EXISTS "next_earnings_date"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fundamentals" DROP COLUMN IF EXISTS "next_earnings_estimate_eps"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fundamentals" DROP COLUMN IF EXISTS "fifty_two_week_high"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fundamentals" DROP COLUMN IF EXISTS "fifty_two_week_low"`,
    );
  }
}
