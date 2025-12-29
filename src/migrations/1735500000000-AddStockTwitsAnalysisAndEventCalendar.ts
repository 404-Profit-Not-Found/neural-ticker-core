import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStockTwitsAnalysisAndEventCalendar1735500000000 implements MigrationInterface {
  name = 'AddStockTwitsAnalysisAndEventCalendar1735500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update tickers table
    await queryRunner.query(
      `ALTER TABLE "tickers" ADD "social_analysis_enabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickers" ADD "social_analysis_enabled_by" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickers" ADD CONSTRAINT "FK_tickers_social_analysis_owner" FOREIGN KEY ("social_analysis_enabled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // Create stocktwits_analyses table
    await queryRunner.query(
      `CREATE TABLE "stocktwits_analyses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ticker_id" bigint NOT NULL, "symbol" character varying NOT NULL, "analysis_start" TIMESTAMP WITH TIME ZONE NOT NULL, "analysis_end" TIMESTAMP WITH TIME ZONE NOT NULL, "sentiment_score" numeric(4,3) NOT NULL, "sentiment_label" text NOT NULL, "posts_analyzed" integer NOT NULL, "weighted_sentiment_score" numeric(4,3) NOT NULL, "summary" text NOT NULL, "highlights" jsonb NOT NULL, "extracted_events" jsonb NOT NULL, "model_used" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_stocktwits_analyses" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_stocktwits_analyses_symbol" ON "stocktwits_analyses" ("symbol")`,
    );
    await queryRunner.query(
      `ALTER TABLE "stocktwits_analyses" ADD CONSTRAINT "FK_stocktwits_analyses_ticker" FOREIGN KEY ("ticker_id") REFERENCES "tickers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Create event_calendar table
    await queryRunner.query(
      `CREATE TABLE "event_calendar" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ticker_id" bigint NOT NULL, "symbol" character varying NOT NULL, "title" text NOT NULL, "description" text, "event_date" date, "date_text" text, "event_type" text NOT NULL, "source" text NOT NULL, "confidence" numeric(3,2) NOT NULL DEFAULT '1.00', "impact_score" integer, "expected_impact" text, "source_reference" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_event_calendar" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_event_calendar_symbol" ON "event_calendar" ("symbol")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_event_calendar_event_date" ON "event_calendar" ("event_date")`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_calendar" ADD CONSTRAINT "FK_event_calendar_ticker" FOREIGN KEY ("ticker_id") REFERENCES "tickers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "event_calendar" DROP CONSTRAINT "FK_event_calendar_ticker"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_event_calendar_event_date"`);
    await queryRunner.query(`DROP INDEX "IDX_event_calendar_symbol"`);
    await queryRunner.query(`DROP TABLE "event_calendar"`);

    await queryRunner.query(
      `ALTER TABLE "stocktwits_analyses" DROP CONSTRAINT "FK_stocktwits_analyses_ticker"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_stocktwits_analyses_symbol"`);
    await queryRunner.query(`DROP TABLE "stocktwits_analyses"`);

    await queryRunner.query(
      `ALTER TABLE "tickers" DROP CONSTRAINT "FK_tickers_social_analysis_owner"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickers" DROP COLUMN "social_analysis_enabled_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickers" DROP COLUMN "social_analysis_enabled"`,
    );
  }
}
