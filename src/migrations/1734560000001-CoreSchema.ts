import { MigrationInterface, QueryRunner } from 'typeorm';

export class CoreSchema1734600000000 implements MigrationInterface {
  name = 'CoreSchema1734600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 0. Extensions
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // 1. Users Table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" character varying NOT NULL,
        "google_id" character varying,
        "full_name" character varying,
        "role" character varying NOT NULL DEFAULT 'user',
        "tier" text NOT NULL DEFAULT 'free',
        "credits_balance" integer NOT NULL DEFAULT 10,
        "credits_reset_at" TIMESTAMP WITH TIME ZONE,
        "avatar_url" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "last_login" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "preferences" jsonb,
        "nickname" character varying,
        "view_mode" character varying NOT NULL DEFAULT 'PRO',
        "theme" character varying NOT NULL DEFAULT 'dark',
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "UQ_users_google_id" UNIQUE ("google_id"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);

    // 2. Tickers Table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tickers" (
        "id" BIGSERIAL NOT NULL,
        "symbol" text NOT NULL,
        "name" text NOT NULL,
        "exchange" text NOT NULL,
        "currency" text NOT NULL,
        "country" text NOT NULL,
        "ipo_date" date,
        "market_capitalization" numeric(24,4),
        "share_outstanding" numeric(24,8),
        "phone" text,
        "web_url" text,
        "logo_url" text,
        "finnhub_industry" text,
        "sector" text,
        "industry" text,
        "description" text,
        "is_hidden" boolean NOT NULL DEFAULT false,
        "finnhub_raw" jsonb,
        "news_summary" text,
        "news_sentiment" text,
        "news_impact_score" integer,
        "last_news_update" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_tickers_symbol" UNIQUE ("symbol"),
        CONSTRAINT "PK_tickers" PRIMARY KEY ("id")
      )
    `);

    // 3. Fundamentals Table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fundamentals" (
        "symbol_id" bigint NOT NULL,
        "market_cap" numeric(24,4),
        "shares_outstanding" numeric(24,2),
        "pe_ttm" numeric(18,4),
        "trailing_pe" numeric(18,4),
        "forward_pe" numeric(18,4),
        "eps_ttm" numeric(18,4),
        "dividend_yield" numeric(10,4),
        "beta" numeric(10,4),
        "debt_to_equity" numeric(10,4),
        "revenue_ttm" numeric(24,4),
        "gross_margin" numeric(10,4),
        "net_profit_margin" numeric(10,4),
        "operating_margin" numeric(10,4),
        "roe" numeric(10,4),
        "roa" numeric(10,4),
        "price_to_book" numeric(10,4),
        "book_value_per_share" numeric(18,4),
        "free_cash_flow_ttm" numeric(24,4),
        "earnings_growth_yoy" numeric(10,4),
        "current_ratio" numeric(10,4),
        "quick_ratio" numeric(10,4),
        "interest_coverage" numeric(10,4),
        "debt_to_assets" numeric(10,4),
        "net_income_ttm" numeric(24,4),
        "total_debt" numeric(24,4),
        "total_assets" numeric(24,4),
        "total_liabilities" numeric(24,4),
        "total_cash" numeric(24,4),
        "next_earnings_date" date,
        "next_earnings_estimate_eps" numeric(10,4),
        "consensus_rating" text,
        "sector" text,
        "fifty_two_week_high" numeric(18,4),
        "fifty_two_week_low" numeric(18,4),
        "yahoo_metadata" jsonb,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_fundamentals" PRIMARY KEY ("symbol_id")
      )
    `);

    // 4. Price OHLCV Table
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
        CONSTRAINT "PK_price_ohlcv" PRIMARY KEY ("symbol_id", "ts", "timeframe")
      )
    `);

    // 5. Analyst Ratings Table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "analyst_ratings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "symbol_id" bigint NOT NULL,
        "firm" text NOT NULL,
        "analyst_name" text,
        "rating" text NOT NULL,
        "price_target" numeric(18,4),
        "rating_date" date NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_analyst_ratings" PRIMARY KEY ("id")
      )
    `);

    // 6. Company News Table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "company_news" (
        "id" BIGSERIAL NOT NULL,
        "symbol_id" bigint NOT NULL,
        "external_id" text NOT NULL,
        "datetime" TIMESTAMP WITH TIME ZONE NOT NULL,
        "headline" text NOT NULL,
        "source" text NOT NULL,
        "url" text NOT NULL,
        "summary" text NOT NULL,
        "image" text,
        "related" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_company_news_symbol_external" UNIQUE ("symbol_id", "external_id"),
        CONSTRAINT "PK_company_news" PRIMARY KEY ("id")
      )
    `);

    // 7. Watchlists Table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "watchlists" (
        "id" BIGSERIAL NOT NULL,
        "name" text NOT NULL,
        "user_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_watchlists" PRIMARY KEY ("id")
      )
    `);

    // 8. Watchlist Items Table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "watchlist_items" (
        "id" BIGSERIAL NOT NULL,
        "watchlist_id" bigint NOT NULL,
        "ticker_id" bigint NOT NULL,
        "added_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_watchlist_items" PRIMARY KEY ("id")
      )
    `);

    // 9. Comments Table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "comments" (
        "id" BIGSERIAL NOT NULL,
        "ticker_symbol" text NOT NULL,
        "content" text NOT NULL,
        "user_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_comments" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "comments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "watchlist_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "watchlists"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "company_news"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "analyst_ratings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "price_ohlcv"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fundamentals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tickers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
