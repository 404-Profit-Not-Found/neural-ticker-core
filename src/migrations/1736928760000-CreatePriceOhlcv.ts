import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePriceOhlcv1736928760000 implements MigrationInterface {
  name = 'CreatePriceOhlcv1736928760000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the price_ohlcv table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "price_ohlcv" (
        "symbol_id" bigint NOT NULL,
        "ts" TIMESTAMP WITH TIME ZONE NOT NULL,
        "timeframe" text NOT NULL,
        "open" numeric(18,6) NOT NULL,
        "high" numeric(18,6) NOT NULL,
        "low" numeric(18,6) NOT NULL,
        "close" numeric(18,6) NOT NULL,
        "prevClose" numeric(18,6),
        "volume" numeric(20,4),
        "source" text NOT NULL,
        "inserted_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        PRIMARY KEY ("symbol_id", "ts", "timeframe")
      )
    `);

    // Create composite unique index (same as entity)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_price_ohlcv_symbol_timeframe_ts" 
      ON "price_ohlcv" ("symbol_id", "timeframe", "ts")
    `);

    // Create additional indexes for common query patterns
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_price_ohlcv_symbol_id" 
      ON "price_ohlcv" ("symbol_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_price_ohlcv_ts" 
      ON "price_ohlcv" ("ts" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_price_ohlcv_ts"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_price_ohlcv_symbol_id"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_price_ohlcv_symbol_timeframe_ts"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "price_ohlcv"`);
  }
}
