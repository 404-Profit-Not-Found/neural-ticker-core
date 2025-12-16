import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsHiddenToTickers1765923111737 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "tickers" ADD COLUMN IF NOT EXISTS "is_hidden" boolean NOT NULL DEFAULT false
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "tickers" DROP COLUMN IF EXISTS "is_hidden"
        `);
  }
}
