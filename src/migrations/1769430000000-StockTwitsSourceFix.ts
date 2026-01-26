import { MigrationInterface, QueryRunner } from 'typeorm';

export class StockTwitsSourceFix1769430000000 implements MigrationInterface {
  name = 'StockTwitsSourceFix1769430000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Fix missing column in posts
    await queryRunner.query(
      `ALTER TABLE "stocktwits_posts" ADD COLUMN IF NOT EXISTS "inserted_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );

    // 2. Ensure watchers table exists
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stocktwits_watchers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "symbol" character varying NOT NULL,
        "count" integer NOT NULL,
        "timestamp" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "stocktwits_watchers_pkey" PRIMARY KEY ("id")
      )
    `);

    // 3. Robust column checks (in case table existed but was malformed)
    await queryRunner.query(
      `ALTER TABLE "stocktwits_watchers" ADD COLUMN IF NOT EXISTS "symbol" character varying`,
    );
    // Set NOT NULL only if we are sure, or leave nullable initially if data exists?
    // For now, let's just make sure columns exist.

    await queryRunner.query(
      `ALTER TABLE "stocktwits_watchers" ADD COLUMN IF NOT EXISTS "count" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "stocktwits_watchers" ADD COLUMN IF NOT EXISTS "timestamp" timestamp with time zone DEFAULT now()`,
    );

    // Add indices for watchers
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_stocktwits_watchers_symbol" ON "stocktwits_watchers" ("symbol")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_stocktwits_watchers_timestamp" ON "stocktwits_watchers" ("timestamp")`,
    );

    // 4. Fix missing column in analyses (tokens_used was missed in SyncMissingTables)
    await queryRunner.query(
      `ALTER TABLE "stocktwits_analyses" ADD COLUMN IF NOT EXISTS "tokens_used" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stocktwits_analyses" DROP COLUMN IF EXISTS "tokens_used"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "stocktwits_watchers"`);
    await queryRunner.query(
      `ALTER TABLE "stocktwits_posts" DROP COLUMN IF EXISTS "inserted_at"`,
    );
  }
}
