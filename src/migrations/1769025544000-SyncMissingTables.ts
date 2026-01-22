import { MigrationInterface, QueryRunner } from 'typeorm';

export class SyncMissingTables1769025544000 implements MigrationInterface {
  name = 'SyncMissingTables1769025544000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure uuid-ossp extension is enabled
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Enums
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_calendar_event_type_enum') THEN
          CREATE TYPE "event_calendar_event_type_enum" AS ENUM ('earnings', 'fda_decision', 'conference', 'product_launch', 'legal', 'regulatory', 'analyst', 'other');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_calendar_source_enum') THEN
          CREATE TYPE "event_calendar_source_enum" AS ENUM ('stocktwits', 'ai_search', 'risk_analysis', 'manual');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_queue_status_enum') THEN
          CREATE TYPE "request_queue_status_enum" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_queue_type_enum') THEN
          CREATE TYPE "request_queue_type_enum" AS ENUM ('ADD_TICKER');
        END IF;
      END$$;
    `);

    // Tables

    // event_calendar
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "event_calendar" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ticker_id" bigint NOT NULL,
        "symbol" character varying NOT NULL,
        "title" text NOT NULL,
        "description" text,
        "event_date" date,
        "date_text" text,
        "confidence" numeric NOT NULL DEFAULT '1',
        "impact_score" integer,
        "expected_impact" text,
        "event_type" "event_calendar_event_type_enum" NOT NULL,
        "source" "event_calendar_source_enum" NOT NULL,
        "source_reference" jsonb,
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "event_calendar_pkey" PRIMARY KEY ("id")
      );
    `);

    // request_queue
    // Note: 'payload' is 'json' in local DDL.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "request_queue" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" "request_queue_type_enum" NOT NULL,
        "payload" json NOT NULL,
        "status" "request_queue_status_enum" NOT NULL DEFAULT 'PENDING',
        "attempts" integer NOT NULL DEFAULT 0,
        "next_attempt" timestamp with time zone NOT NULL DEFAULT now(),
        "created_at" timestamp without time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp without time zone NOT NULL DEFAULT now(),
        CONSTRAINT "request_queue_pkey" PRIMARY KEY ("id")
      );
    `);

    // stocktwits_analyses
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stocktwits_analyses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ticker_id" bigint NOT NULL,
        "symbol" character varying NOT NULL,
        "sentiment_score" numeric NOT NULL,
        "sentiment_label" text NOT NULL,
        "posts_analyzed" integer NOT NULL,
        "weighted_sentiment_score" numeric NOT NULL,
        "summary" text NOT NULL,
        "model_used" text NOT NULL,
        "analysis_start" timestamp with time zone NOT NULL,
        "analysis_end" timestamp with time zone NOT NULL,
        "highlights" jsonb NOT NULL,
        "extracted_events" jsonb NOT NULL,
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "stocktwits_analyses_pkey" PRIMARY KEY ("id")
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS "stocktwits_analyses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "request_queue"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "event_calendar"`);

    // We do NOT drop enums here generally because other things might use them in future,
    // but for strict reversibility of THIS migration which created them:
    // (We assumed they didn't exist before)
    // For safety, let's keep them or just simple drop if exists.
    await queryRunner.query(`DROP TYPE IF EXISTS "request_queue_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "request_queue_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "event_calendar_source_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "event_calendar_event_type_enum"`,
    );
  }
}
