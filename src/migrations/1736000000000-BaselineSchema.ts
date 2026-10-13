import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BASELINE: the tables no migration ever created.
 *
 * 22 of the entity tables were originally created by TypeORM `synchronize`,
 * and every later migration assumes they exist. A fresh environment (CI, a new
 * region, disaster recovery, a contributor's machine) therefore could not be
 * built from this repository: the second migration already failed with
 * `relation "users" does not exist`. This migration sorts before all the
 * others and creates what is missing.
 *
 * ON A DATABASE THAT ALREADY HAS THE SCHEMA (PRODUCTION) IT DOES NOTHING.
 * Each table is handled on its own: if it exists, not a single statement is
 * issued for it — no CREATE ... IF NOT EXISTS, no index, no constraint, so no
 * lock is taken on a populated table and nothing about it can change. (TypeORM
 * runs a not-yet-recorded migration whatever its timestamp: pending = "name
 * not in the migrations table", MigrationExecutor.executePendingMigrations.)
 * The first boot after deploy records one row in `migrations`.
 *
 * Each table is created in its PRE-MIGRATION shape — the entity definition
 * minus what the later migrations add themselves:
 *   users                without has_onboarded      (AddHasOnboardedToUser, a plain ADD)
 *   comments             without parent_id / moderation_*  (AddCommentRepliesAndLikes, AddCommentModeration)
 *   stocktwits_posts     without inserted_at        (StockTwitsSourceFix)
 *   research_notes       without content_hash / enrichment_status
 *   portfolio_positions  without currency           (AddCurrencyToPortfolioPositions)
 *   portfolio_analyses   with the original non-cascading user FK (AddCascadeToPortfolioAnalyses replaces it)
 *   tickers              without created_by_user_id (AddTickerCreatedBy)
 * so that an empty database ends up exactly where a migrated one is.
 *
 * The statements are the ones TypeORM's schema builder issues for these
 * entities on an empty database (same column types, defaults and constraint /
 * index names), reformatted.
 *
 * `down` is deliberately empty: reverting a baseline must never drop the
 * tables that hold the data.
 */

interface BaselineTable {
  table: string;
  /** Run in order, and only when `table` does not exist yet. */
  statements: string[];
}

/** In dependency order: a table comes after the tables its FKs point to. */
const BASELINE_TABLES: BaselineTable[] = [
  {
    table: 'users',
    statements: [
      `CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" character varying NOT NULL,
        "google_id" character varying,
        "full_name" character varying,
        "role" character varying NOT NULL DEFAULT 'user',
        "tier" text NOT NULL DEFAULT 'free',
        "credits_balance" integer NOT NULL DEFAULT '10',
        "credits_reset_at" TIMESTAMP WITH TIME ZONE,
        "avatar_url" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "last_login" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "preferences" jsonb,
        "nickname" character varying,
        "view_mode" character varying NOT NULL DEFAULT 'PRO',
        "theme" character varying NOT NULL DEFAULT 'dark',
        CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"),
        CONSTRAINT "UQ_0bd5012aeb82628e07f6a1be53b" UNIQUE ("google_id"),
        CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
      )`,
    ],
  },
  {
    table: 'tickers',
    statements: [
      `CREATE TABLE "tickers" (
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
        CONSTRAINT "UQ_c0939a17cc28d6e20bbd97dc51c" UNIQUE ("symbol"),
        CONSTRAINT "PK_c2a03993ab14bc2e244d7571f1c" PRIMARY KEY ("id")
      )`,
    ],
  },
  {
    table: 'allowed_users',
    statements: [
      `CREATE TABLE "allowed_users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" character varying NOT NULL,
        "added_by" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_914a1e30803bf54ccb355fa6808" UNIQUE ("email"),
        CONSTRAINT "PK_b2bf805db25ec806d5c1c14619d" PRIMARY KEY ("id")
      )`,
    ],
  },
  {
    table: 'auth_logs',
    statements: [
      `CREATE TABLE "auth_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" text,
        "provider" text NOT NULL,
        "email" text,
        "login_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "ip_address" text,
        "user_agent" text,
        CONSTRAINT "PK_f4ee581a4a56f10b64ffbfc1779" PRIMARY KEY ("id")
      )`,
      `CREATE INDEX "IDX_99bd49e6f66a26e4bf6bc7c17b" ON "auth_logs" ("user_id")`,
    ],
  },
  {
    table: 'credit_transactions',
    statements: [
      `CREATE TABLE "credit_transactions" (
        "id" SERIAL NOT NULL,
        "user_id" uuid NOT NULL,
        "amount" integer NOT NULL,
        "reason" text NOT NULL,
        "metadata" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_a408319811d1ab32832ec86fc2c" PRIMARY KEY ("id")
      )`,
      `ALTER TABLE "credit_transactions" ADD CONSTRAINT "FK_9ac41a5292ef4d8356a86be30c2" FOREIGN KEY ("user_id") REFERENCES "users"("id")`,
    ],
  },
  {
    table: 'watchlists',
    statements: [
      `CREATE TABLE "watchlists" (
        "id" BIGSERIAL NOT NULL,
        "name" text NOT NULL,
        "user_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_aa3c717b50a10f7a435c65eda5a" PRIMARY KEY ("id")
      )`,
      `ALTER TABLE "watchlists" ADD CONSTRAINT "FK_3e8bccad3dcd75fa977892c54bb" FOREIGN KEY ("user_id") REFERENCES "users"("id")`,
    ],
  },
  {
    table: 'watchlist_items',
    statements: [
      `CREATE TABLE "watchlist_items" (
        "id" BIGSERIAL NOT NULL,
        "watchlist_id" bigint NOT NULL,
        "ticker_id" bigint NOT NULL,
        "added_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_0a02323c5cc02e094871f24062b" PRIMARY KEY ("id")
      )`,
      `ALTER TABLE "watchlist_items" ADD CONSTRAINT "FK_39dffbdc9256662f284befadc16" FOREIGN KEY ("watchlist_id") REFERENCES "watchlists"("id") ON DELETE CASCADE`,
      `ALTER TABLE "watchlist_items" ADD CONSTRAINT "FK_e13f208fee6bc04be9530cefc3d" FOREIGN KEY ("ticker_id") REFERENCES "tickers"("id") ON DELETE CASCADE`,
    ],
  },
  {
    table: 'ticker_logos',
    statements: [
      `CREATE TABLE "ticker_logos" (
        "symbol_id" bigint NOT NULL,
        "image_data" bytea NOT NULL,
        "mime_type" text NOT NULL,
        CONSTRAINT "PK_2984405e642902a646eebceb5f6" PRIMARY KEY ("symbol_id")
      )`,
      `ALTER TABLE "ticker_logos" ADD CONSTRAINT "FK_2984405e642902a646eebceb5f6" FOREIGN KEY ("symbol_id") REFERENCES "tickers"("id") ON DELETE CASCADE`,
    ],
  },
  {
    table: 'comments',
    statements: [
      `CREATE TABLE "comments" (
        "id" BIGSERIAL NOT NULL,
        "ticker_symbol" text NOT NULL,
        "content" text NOT NULL,
        "user_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_8bf68bc960f2b69e818bdb90dcb" PRIMARY KEY ("id")
      )`,
      `ALTER TABLE "comments" ADD CONSTRAINT "FK_4c675567d2a58f0b07cef09c13d" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE`,
    ],
  },
  {
    table: 'stocktwits_posts',
    statements: [
      `CREATE TABLE "stocktwits_posts" (
        "id" bigint NOT NULL,
        "symbol" character varying NOT NULL,
        "username" character varying NOT NULL,
        "body" text NOT NULL,
        "likes_count" integer NOT NULL DEFAULT '0',
        "user_followers_count" integer NOT NULL DEFAULT '0',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_42b0e105a04cf29c63cb76f3ea3" PRIMARY KEY ("id")
      )`,
      `CREATE INDEX "IDX_fa343e497ee54fdcadce74be26" ON "stocktwits_posts" ("symbol")`,
      `CREATE INDEX "IDX_3280934f38a571650079b88ab8" ON "stocktwits_posts" ("created_at")`,
      `CREATE INDEX "IDX_09c86ec92a11e9e7673c684da5" ON "stocktwits_posts" ("symbol", "created_at")`,
    ],
  },
  {
    table: 'risk_analyses',
    statements: [
      `CREATE TABLE "risk_analyses" (
        "id" BIGSERIAL NOT NULL,
        "ticker_id" bigint NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "model_version" text NOT NULL DEFAULT '1.0.0',
        "overall_score" numeric(4,2) NOT NULL,
        "financial_risk" numeric(4,2) NOT NULL,
        "execution_risk" numeric(4,2) NOT NULL,
        "dilution_risk" numeric(4,2) NOT NULL,
        "competitive_risk" numeric(4,2) NOT NULL,
        "regulatory_risk" numeric(4,2) NOT NULL,
        "time_horizon_years" integer NOT NULL,
        "price_target_weighted" numeric(10,2) NOT NULL,
        "upside_percent" numeric(10,2) NOT NULL,
        "analyst_target_avg" numeric(10,2),
        "analyst_target_range_low" numeric(10,2),
        "analyst_target_range_high" numeric(10,2),
        "sentiment" text,
        "fundamentals" jsonb NOT NULL,
        "red_flags" jsonb NOT NULL DEFAULT '[]',
        "research_note_id" text,
        "metadata" jsonb,
        CONSTRAINT "PK_4ecd657a0ab18eadff9469789bf" PRIMARY KEY ("id")
      )`,
      `ALTER TABLE "risk_analyses" ADD CONSTRAINT "FK_e05b8fe0ad06a6ba711a9cfaa33" FOREIGN KEY ("ticker_id") REFERENCES "tickers"("id")`,
    ],
  },
  {
    table: 'risk_scenarios',
    statements: [
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_scenarios_scenario_type_enum') THEN
          CREATE TYPE "risk_scenarios_scenario_type_enum" AS ENUM ('bull', 'base', 'bear');
        END IF;
      END $$`,
      `CREATE TABLE "risk_scenarios" (
        "id" BIGSERIAL NOT NULL,
        "analysis_id" bigint NOT NULL,
        "scenario_type" "risk_scenarios_scenario_type_enum" NOT NULL,
        "probability" numeric(5,4) NOT NULL,
        "description" text NOT NULL,
        "price_low" numeric(10,2) NOT NULL,
        "price_high" numeric(10,2) NOT NULL,
        "price_mid" numeric(10,2) NOT NULL,
        "expected_market_cap" numeric(20,2) NOT NULL,
        "key_drivers" jsonb NOT NULL,
        CONSTRAINT "PK_da01b503d9898afb6806c97b4ff" PRIMARY KEY ("id")
      )`,
      `ALTER TABLE "risk_scenarios" ADD CONSTRAINT "FK_a2bd631d6e52f6fa9e824d5bb25" FOREIGN KEY ("analysis_id") REFERENCES "risk_analyses"("id") ON DELETE CASCADE`,
    ],
  },
  {
    table: 'risk_catalysts',
    statements: [
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_catalysts_timeframe_enum') THEN
          CREATE TYPE "risk_catalysts_timeframe_enum" AS ENUM ('near_term', 'long_term');
        END IF;
      END $$`,
      `CREATE TABLE "risk_catalysts" (
        "id" BIGSERIAL NOT NULL,
        "analysis_id" bigint NOT NULL,
        "timeframe" "risk_catalysts_timeframe_enum" NOT NULL,
        "description" text NOT NULL,
        CONSTRAINT "PK_e6147c6e7a36340b9c65d0dcaf8" PRIMARY KEY ("id")
      )`,
      `ALTER TABLE "risk_catalysts" ADD CONSTRAINT "FK_3073c71ffecb6ccaa15c4a95fc2" FOREIGN KEY ("analysis_id") REFERENCES "risk_analyses"("id") ON DELETE CASCADE`,
    ],
  },
  {
    table: 'risk_qualitative_factors',
    statements: [
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_qualitative_factors_factor_type_enum') THEN
          CREATE TYPE "risk_qualitative_factors_factor_type_enum" AS ENUM ('strength', 'weakness', 'opportunity', 'threat');
        END IF;
      END $$`,
      `CREATE TABLE "risk_qualitative_factors" (
        "id" BIGSERIAL NOT NULL,
        "analysis_id" bigint NOT NULL,
        "factor_type" "risk_qualitative_factors_factor_type_enum" NOT NULL,
        "description" text NOT NULL,
        CONSTRAINT "PK_c644238b1a2c17be9b48975efda" PRIMARY KEY ("id")
      )`,
      `ALTER TABLE "risk_qualitative_factors" ADD CONSTRAINT "FK_8043f0b89586e15aa51dba61d88" FOREIGN KEY ("analysis_id") REFERENCES "risk_analyses"("id") ON DELETE CASCADE`,
    ],
  },
  {
    table: 'risk_reward_scores',
    statements: [
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_reward_scores_confidence_level_enum') THEN
          CREATE TYPE "risk_reward_scores_confidence_level_enum" AS ENUM ('low', 'medium', 'high');
        END IF;
      END $$`,
      `CREATE TABLE "risk_reward_scores" (
        "id" BIGSERIAL NOT NULL,
        "symbol_id" bigint NOT NULL,
        "as_of" TIMESTAMP WITH TIME ZONE NOT NULL,
        "risk_reward_score" integer NOT NULL,
        "risk_score" integer,
        "reward_score" integer,
        "confidence_level" "risk_reward_scores_confidence_level_enum" NOT NULL DEFAULT 'medium',
        "provider" text NOT NULL,
        "models_used" text array NOT NULL,
        "research_note_id" bigint,
        "rationale_markdown" text NOT NULL,
        "numeric_context" jsonb NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_b2f6f9bdde9a026fe0a79685d55" PRIMARY KEY ("id")
      )`,
      `CREATE INDEX "IDX_8c99a3af678de1e80a807402b3" ON "risk_reward_scores" ("symbol_id", "as_of")`,
    ],
  },
  {
    table: 'research_notes',
    statements: [
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'research_notes_provider_enum') THEN
          CREATE TYPE "research_notes_provider_enum" AS ENUM ('openai', 'gemini', 'ensemble', 'manual');
        END IF;
      END $$`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'research_notes_status_enum') THEN
          CREATE TYPE "research_notes_status_enum" AS ENUM ('pending', 'processing', 'completed', 'failed');
        END IF;
      END $$`,
      `CREATE TABLE "research_notes" (
        "id" BIGSERIAL NOT NULL,
        "request_id" uuid NOT NULL,
        "tickers" text array NOT NULL,
        "question" text NOT NULL,
        "provider" "research_notes_provider_enum" NOT NULL,
        "quality" text NOT NULL DEFAULT 'medium',
        "models_used" text array NOT NULL DEFAULT '{}',
        "title" text,
        "answer_markdown" text,
        "full_response" text,
        "numeric_context" jsonb NOT NULL DEFAULT '{}',
        "grounding_metadata" jsonb,
        "thinking_process" text,
        "tokens_in" integer,
        "tokens_out" integer,
        "status" "research_notes_status_enum" NOT NULL DEFAULT 'pending',
        "error" text,
        "user_id" uuid,
        "quality_score" integer,
        "rarity" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_e9d49a4a808d7e78d59637ca19b" PRIMARY KEY ("id")
      )`,
      `ALTER TABLE "research_notes" ADD CONSTRAINT "FK_566551a7e24e0db816a0b2b2047" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    ],
  },
  {
    table: 'portfolio_positions',
    statements: [
      `CREATE TABLE "portfolio_positions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "symbol" character varying NOT NULL,
        "shares" numeric(10,2) NOT NULL,
        "buy_price" numeric(10,2) NOT NULL,
        "buy_date" date NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_40ad2ad5289b84d84729bb74b2f" PRIMARY KEY ("id")
      )`,
      `CREATE INDEX "IDX_576b7766c534c681018e8e9b8b" ON "portfolio_positions" ("user_id", "symbol")`,
      `ALTER TABLE "portfolio_positions" ADD CONSTRAINT "FK_60f4bb451c944bba07d6d8ac0be" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE`,
    ],
  },
  {
    table: 'notifications',
    statements: [
      `CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" character varying NOT NULL,
        "title" character varying NOT NULL,
        "message" text,
        "read" boolean NOT NULL DEFAULT false,
        "data" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id")
      )`,
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE`,
    ],
  },
  {
    table: 'portfolio_analyses',
    statements: [
      `CREATE TABLE "portfolio_analyses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "riskAppetite" character varying,
        "horizon" character varying,
        "goal" character varying,
        "model" character varying,
        "prompt" text NOT NULL,
        "response" text NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_4759e48c3a6cccd0692088d17b6" PRIMARY KEY ("id")
      )`,
      `ALTER TABLE "portfolio_analyses" ADD CONSTRAINT "FK_dc21bc5a9c5ec3915afecd8afde" FOREIGN KEY ("userId") REFERENCES "users"("id")`,
    ],
  },
  {
    table: 'company_news',
    statements: [
      `CREATE TABLE "company_news" (
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
        CONSTRAINT "UQ_45dc5458ea51f6d452256dd0669" UNIQUE ("symbol_id", "external_id"),
        CONSTRAINT "PK_9e73481ee8a4a481bd27c1ebc29" PRIMARY KEY ("id")
      )`,
      `CREATE INDEX "IDX_27b47d309cd8a4f10dc713dcbe" ON "company_news" ("symbol_id", "datetime")`,
      `ALTER TABLE "company_news" ADD CONSTRAINT "FK_d7488b406c8416d6dcb88260b01" FOREIGN KEY ("symbol_id") REFERENCES "tickers"("id") ON DELETE CASCADE`,
    ],
  },
  {
    table: 'analyst_ratings',
    statements: [
      `CREATE TABLE "analyst_ratings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "symbol_id" bigint NOT NULL,
        "firm" text NOT NULL,
        "analyst_name" text,
        "rating" text NOT NULL,
        "price_target" numeric(18,4),
        "rating_date" date NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_a0f37d1376fc911f5f351be3155" PRIMARY KEY ("id")
      )`,
    ],
  },
  {
    table: 'fundamentals',
    statements: [
      `CREATE TABLE "fundamentals" (
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
        CONSTRAINT "PK_c6092af6687077d8b3299d9032b" PRIMARY KEY ("symbol_id")
      )`,
    ],
  },
];

export class BaselineSchema1736000000000 implements MigrationInterface {
  name = 'BaselineSchema1736000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const missing: BaselineTable[] = [];
    for (const entry of BASELINE_TABLES) {
      // to_regclass only looks the name up; it takes no lock on the table.
      const [{ present }] = await queryRunner.query(
        'SELECT to_regclass($1::text) IS NOT NULL AS present',
        [`"${entry.table}"`],
      );
      if (!present) missing.push(entry);
    }
    if (missing.length === 0) return;

    // uuid_generate_v4() — the column default of every uuid primary key.
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    for (const entry of missing) {
      for (const statement of entry.statements) {
        await queryRunner.query(statement);
      }
    }
  }

  public async down(): Promise<void> {
    // Intentionally a no-op — see the note at the top of this file.
  }
}
