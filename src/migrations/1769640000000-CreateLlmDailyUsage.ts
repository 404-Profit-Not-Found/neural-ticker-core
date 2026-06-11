import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLlmDailyUsage1769640000000 implements MigrationInterface {
  name = 'CreateLlmDailyUsage1769640000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "llm_daily_usage" (
        "usage_date" DATE PRIMARY KEY,
        "count" INTEGER NOT NULL DEFAULT 0,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "llm_daily_usage"`);
  }
}
