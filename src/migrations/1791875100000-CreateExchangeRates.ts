import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `exchange_rates`, the DB cache CurrencyService writes live FX rates
 * to and falls back on when every live source is down.
 *
 * The entity has existed since multi-currency support, but the table was only
 * ever created by TypeORM `synchronize`, which is off in production — so prod
 * logged `relation "exchange_rates" does not exist` on every refresh and had no
 * cached rates to fall back on. Columns mirror ExchangeRateEntity exactly;
 * IF NOT EXISTS keeps it a no-op where synchronize already made the table.
 */
export class CreateExchangeRates1791875100000 implements MigrationInterface {
  name = 'CreateExchangeRates1791875100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "exchange_rates" (
        "currency_code" character varying NOT NULL,
        "rate_to_usd" double precision NOT NULL,
        "last_updated" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_exchange_rates_currency_code" PRIMARY KEY ("currency_code")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "exchange_rates"`);
  }
}
