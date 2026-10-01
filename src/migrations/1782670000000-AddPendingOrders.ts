import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Market-hours trading: a queue of pending buy/sell orders.
 *
 * Live buys/sells are only allowed while the relevant market is OPEN. An order
 * placed while the market is closed is parked here as a 'pending' row and filled
 * by the cron filler at the next open, at the MARKET PRICE at fill time (there is
 * no locked price — `requested_price` is informational only, the snapshot shown
 * at placement). "Add Position" is a separate historical import and is NOT gated,
 * so it never touches this table.
 */
export class AddPendingOrders1782670000000 implements MigrationInterface {
  name = 'AddPendingOrders1782670000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "portfolio_pending_orders" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "position_id" uuid NULL REFERENCES "portfolio_positions"("id") ON DELETE SET NULL,
        "symbol" varchar NOT NULL,
        "side" varchar(4) NOT NULL,
        "shares" numeric(20,8) NOT NULL,
        "currency" varchar(3) NOT NULL DEFAULT 'USD',
        "status" varchar(12) NOT NULL DEFAULT 'pending',
        "region" varchar(8) NULL,
        "requested_price" numeric(20,8) NULL,
        "fees" numeric(20,2) NOT NULL DEFAULT 0,
        "note" text NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "filled_at" TIMESTAMPTZ NULL,
        "filled_price" numeric(20,8) NULL,
        "filled_trade_id" uuid NULL REFERENCES "portfolio_trades"("id") ON DELETE SET NULL,
        "error" text NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Per-user listing of their own (mostly pending) orders, newest first.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_portfolio_pending_user_status"
      ON "portfolio_pending_orders" ("user_id", "status")
    `);
    // The cron filler scans by (status, region) to pick up due orders cheaply.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_portfolio_pending_status_region"
      ON "portfolio_pending_orders" ("status", "region")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "portfolio_pending_orders"`,
    );
  }
}
