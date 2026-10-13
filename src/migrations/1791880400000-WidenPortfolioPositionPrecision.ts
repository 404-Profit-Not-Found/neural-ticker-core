import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `portfolio_positions` kept share quantities and prices to two decimals,
 * while trades and pending orders keep eight and the API accepts quantities
 * down to 0.0001.
 *
 * Buying by amount gives fractional shares: 1,000 USD at 232.29 is 4.305
 * shares. The trade recorded 4.305, the position stored 4.31 — so the holding
 * was worth more than was paid for it, and "sell all" sold shares that had
 * never been bought. Both columns now match the trade tables.
 *
 * Positions that were already rounded stay as they are; the lost digits
 * cannot be recovered. Changing the scale rewrites the table under an
 * exclusive lock — it holds one row per position, so this is brief.
 */
export class WidenPortfolioPositionPrecision1791880400000 implements MigrationInterface {
  name = 'WidenPortfolioPositionPrecision1791880400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "portfolio_positions"
         ALTER COLUMN "shares" TYPE numeric(20,8),
         ALTER COLUMN "buy_price" TYPE numeric(20,8)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "portfolio_positions"
         ALTER COLUMN "shares" TYPE numeric(10,2),
         ALTER COLUMN "buy_price" TYPE numeric(10,2)`,
    );
  }
}
