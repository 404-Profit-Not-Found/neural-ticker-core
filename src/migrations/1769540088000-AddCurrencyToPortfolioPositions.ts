import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCurrencyToPortfolioPositions1769540088000
  implements MigrationInterface
{
  name = 'AddCurrencyToPortfolioPositions1769540088000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "portfolio_positions"
      ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) DEFAULT 'USD'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "portfolio_positions"
      DROP COLUMN IF EXISTS "currency"
    `);
  }
}
