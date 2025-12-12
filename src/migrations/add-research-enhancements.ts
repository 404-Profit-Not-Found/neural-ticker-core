import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddResearchEnhancements1702311000000 implements MigrationInterface {
  name = 'AddResearchEnhancements1702311000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new columns to research_notes table
    await queryRunner.query(`
      ALTER TABLE "research_notes" 
      ADD COLUMN IF NOT EXISTS "title" TEXT,
      ADD COLUMN IF NOT EXISTS "full_response" TEXT,
      ADD COLUMN IF NOT EXISTS "grounding_metadata" JSONB,
      ADD COLUMN IF NOT EXISTS "thinking_process" TEXT,
      ADD COLUMN IF NOT EXISTS "tokens_in" INTEGER,
      ADD COLUMN IF NOT EXISTS "tokens_out" INTEGER;
    `);

    // Add index for better search performance on titles
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_notes_title" 
      ON "research_notes" USING gin(to_tsvector('english', "title"));
    `);

    // Add index for better sorting by creation date
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_notes_created_at" 
      ON "research_notes" ("created_at" DESC);
    `);

    // Add index for user_id lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_notes_user_id" 
      ON "research_notes" ("user_id");
    `);

    // Add index for status filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_notes_status" 
      ON "research_notes" ("status");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_research_notes_status"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_research_notes_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_research_notes_created_at"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_research_notes_title"`);

    // Drop columns
    await queryRunner.query(`
      ALTER TABLE "research_notes" 
      DROP COLUMN IF EXISTS "tokens_out",
      DROP COLUMN IF EXISTS "tokens_in",
      DROP COLUMN IF EXISTS "thinking_process",
      DROP COLUMN IF EXISTS "grounding_metadata",
      DROP COLUMN IF EXISTS "full_response",
      DROP COLUMN IF EXISTS "title";
    `);
  }
}

// Made with Bob
