import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePriceAlerts1769600000000 implements MigrationInterface {
  name = 'CreatePriceAlerts1769600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "price_alerts" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "ticker_id" BIGINT NOT NULL REFERENCES "tickers"("id") ON DELETE CASCADE,
        "symbol" VARCHAR(20) NOT NULL,
        "alert_type" VARCHAR(30) NOT NULL,
        "target_value" NUMERIC(18,6) NOT NULL,
        "reference_price" NUMERIC(18,6),
        "enabled" BOOLEAN DEFAULT true,
        "triggered_at" TIMESTAMPTZ,
        "cooldown_minutes" INT DEFAULT 60,
        "created_at" TIMESTAMPTZ DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_price_alerts_active"
      ON "price_alerts" ("enabled", "symbol") WHERE "enabled" = true
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_price_alerts_user"
      ON "price_alerts" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "price_alerts"`);
  }
}
