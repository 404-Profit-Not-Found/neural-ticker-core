import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Trading-simulator schema: an append-only trade ledger and a per-currency
 * cash balance.
 *
 * Existing portfolios are left untouched — no cash is retroactively charged and
 * everyone starts at a zero balance (a missing cash row IS zero). To make the
 * history complete from day one, each existing position is backfilled as a
 * synthetic 'backfill' BUY trade; these do NOT move cash.
 */
export class AddTradingSimulator1782069397844 implements MigrationInterface {
  name = 'AddTradingSimulator1782069397844';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Per-currency cash balance (one row per user+currency).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "portfolio_cash_balances" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "currency" varchar(3) NOT NULL,
        "amount" numeric(20,2) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_portfolio_cash_user_currency"
      ON "portfolio_cash_balances" ("user_id", "currency")
    `);

    // Append-only trade ledger.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "portfolio_trades" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "position_id" uuid NULL REFERENCES "portfolio_positions"("id") ON DELETE SET NULL,
        "symbol" varchar NOT NULL,
        "side" varchar(4) NOT NULL,
        "shares" numeric(20,8) NOT NULL,
        "price" numeric(20,8) NOT NULL,
        "total_value" numeric(20,2) NOT NULL,
        "fees" numeric(20,2) NOT NULL DEFAULT 0,
        "realized_pnl" numeric(20,2) NULL,
        "currency" varchar(3) NOT NULL DEFAULT 'USD',
        "trade_date" date NOT NULL,
        "source" varchar(32) NOT NULL DEFAULT 'app',
        "external_id" varchar(128) NULL,
        "note" text NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_portfolio_trades_user_symbol"
      ON "portfolio_trades" ("user_id", "symbol")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_portfolio_trades_user_date"
      ON "portfolio_trades" ("user_id", "trade_date")
    `);
    // Idempotency for MCP-consolidated imports: a given source trade is recorded
    // at most once per user. Partial so app-originated trades (NULL) are exempt.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_portfolio_trades_user_external"
      ON "portfolio_trades" ("user_id", "external_id")
      WHERE "external_id" IS NOT NULL
    `);

    // Backfill: one synthetic BUY per existing position so the ledger matches
    // current holdings on day one. Guarded so a partial re-run can't duplicate.
    await queryRunner.query(`
      INSERT INTO "portfolio_trades"
        ("user_id", "position_id", "symbol", "side", "shares", "price",
         "total_value", "fees", "currency", "trade_date", "source")
      SELECT
        p."user_id", p."id", p."symbol", 'buy', p."shares", p."buy_price",
        ROUND(p."shares" * p."buy_price", 2), 0,
        COALESCE(p."currency", 'USD'), p."buy_date", 'backfill'
      FROM "portfolio_positions" p
      WHERE NOT EXISTS (
        SELECT 1 FROM "portfolio_trades" t
        WHERE t."position_id" = p."id" AND t."source" = 'backfill'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "portfolio_trades"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "portfolio_cash_balances"`);
  }
}
