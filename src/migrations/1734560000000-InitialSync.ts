import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSync1734560000000 implements MigrationInterface {
  name = 'InitialSync1734560000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable uuid-ossp extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // 1. Create Portfolio Analyses Table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "portfolio_analyses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "riskAppetite" character varying,
        "horizon" character varying,
        "goal" character varying,
        "model" character varying,
        "prompt" text NOT NULL,
        "response" text NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_portfolio_analyses" PRIMARY KEY ("id")
      )
    `);

    // 2. Create Risk Reward Scores Table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "risk_reward_scores" (
        "id" BIGSERIAL NOT NULL,
        "symbol_id" bigint NOT NULL,
        "as_of" TIMESTAMP WITH TIME ZONE NOT NULL,
        "risk_reward_score" integer NOT NULL,
        "risk_score" integer,
        "reward_score" integer,
        "confidence_level" character varying NOT NULL DEFAULT 'medium',
        "provider" text NOT NULL,
        "models_used" text NOT NULL, -- Simplified as comma separated or handle as array if pg supports
        "research_note_id" bigint,
        "rationale_markdown" text NOT NULL,
        "numeric_context" jsonb NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_risk_reward_scores" PRIMARY KEY ("id")
      )
    `);

    // 3. Create Risk Analyses Table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "risk_analyses" (
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
        CONSTRAINT "PK_risk_analyses" PRIMARY KEY ("id")
      )
    `);

    // 4. Create Risk Catalysts Table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "risk_catalysts" (
        "id" BIGSERIAL NOT NULL,
        "analysis_id" bigint NOT NULL,
        "timeframe" character varying NOT NULL,
        "description" text NOT NULL,
        CONSTRAINT "PK_risk_catalysts" PRIMARY KEY ("id")
      )
    `);

    // 5. Create Risk Scenarios Table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "risk_scenarios" (
        "id" BIGSERIAL NOT NULL,
        "analysis_id" bigint NOT NULL,
        "scenario_type" character varying NOT NULL,
        "probability" numeric(5,4) NOT NULL,
        "description" text NOT NULL,
        "price_low" numeric(10,2) NOT NULL,
        "price_high" numeric(10,2) NOT NULL,
        "price_mid" numeric(10,2) NOT NULL,
        "expected_market_cap" numeric(20,2) NOT NULL,
        "key_drivers" jsonb NOT NULL,
        CONSTRAINT "PK_risk_scenarios" PRIMARY KEY ("id")
      )
    `);

    // 6. Create Risk Qualitative Factors Table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "risk_qualitative_factors" (
        "id" BIGSERIAL NOT NULL,
        "analysis_id" bigint NOT NULL,
        "factor_type" character varying NOT NULL,
        "description" text NOT NULL,
        CONSTRAINT "PK_risk_qualitative_factors" PRIMARY KEY ("id")
      )
    `);

    // 7. Create Credit Transactions Table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "credit_transactions" (
        "id" SERIAL NOT NULL,
        "user_id" uuid NOT NULL,
        "amount" integer NOT NULL,
        "reason" text NOT NULL,
        "metadata" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_credit_transactions" PRIMARY KEY ("id")
      )
    `);

    // 8. Ensure quality_score and rarity in research_notes if table exists
    const researchNotesExists = await queryRunner.hasTable('research_notes');
    if (researchNotesExists) {
        await queryRunner.query(`ALTER TABLE "research_notes" ADD COLUMN IF NOT EXISTS "quality_score" integer`);
        await queryRunner.query(`ALTER TABLE "research_notes" ADD COLUMN IF NOT EXISTS "rarity" text`);
    }

    // 9. Foreign Keys (Safe check)
    try {
        await queryRunner.query(`
            ALTER TABLE "portfolio_analyses" 
            ADD CONSTRAINT "FK_portfolio_analyses_user" 
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
        `);
    } catch (e) { /* Ignore if exists or users table missing */ }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "credit_transactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "risk_qualitative_factors"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "risk_scenarios"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "risk_catalysts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "risk_analyses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "risk_reward_scores"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "portfolio_analyses"`);
  }
}
