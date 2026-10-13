import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Records WHO made the platform start tracking a ticker, for the per-user
 * daily cap on new tickers (TickersService.ensureTicker). Nothing recorded
 * this before: `tickers` had no creator, and `ticker_requests` only knows who
 * asked for an approval.
 *
 * Nullable, no default, no backfill: existing tickers (and tickers created by
 * system jobs) simply have no creator and are never counted against anyone.
 * No foreign key on purpose — the column is an audit trail, and deleting a
 * user must neither fail nor rewrite ticker rows.
 *
 * `tickers` is created by TypeORM `synchronize`, not by a migration, so the
 * statements are guarded to stay idempotent where synchronize already added
 * the column / index.
 */
export class AddTickerCreatedBy1791880000000 implements MigrationInterface {
  name = 'AddTickerCreatedBy1791880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE IF EXISTS "tickers"
      ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid
    `);
    // The cap counts one user's recent creations; system-created rows (NULL)
    // are the vast majority and stay out of the index.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.tickers') IS NOT NULL THEN
          CREATE INDEX IF NOT EXISTS "idx_tickers_created_by_user"
          ON "tickers" ("created_by_user_id", "created_at")
          WHERE "created_by_user_id" IS NOT NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_tickers_created_by_user"`,
    );
    await queryRunner.query(`
      ALTER TABLE IF EXISTS "tickers"
      DROP COLUMN IF EXISTS "created_by_user_id"
    `);
  }
}
