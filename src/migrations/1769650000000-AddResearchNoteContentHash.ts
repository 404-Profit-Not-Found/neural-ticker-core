import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `content_hash` fingerprint column + a (user_id, content_hash) index
 * to research_notes, backing the contribution-credit dedup (H10/M11).
 *
 * research_notes is created by TypeORM `synchronize`, not by a migration, so
 * every statement is guarded with IF [NOT] EXISTS to stay idempotent and to
 * never fail on an environment where synchronize already added the column.
 *
 * The index is intentionally NON-unique: the same user re-posting identical
 * content still produces a row (for their feed), but the app-level dedup +
 * row-locked daily cap prevent re-rewarding it. A partial-unique index would
 * reject those legitimate duplicate rows outright.
 */
export class AddResearchNoteContentHash1769650000000 implements MigrationInterface {
  name = 'AddResearchNoteContentHash1769650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE IF EXISTS "research_notes"
      ADD COLUMN IF NOT EXISTS "content_hash" VARCHAR(64)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_notes_user_content_hash"
      ON "research_notes" ("user_id", "content_hash")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_research_notes_user_content_hash"
    `);
    await queryRunner.query(`
      ALTER TABLE IF EXISTS "research_notes"
      DROP COLUMN IF EXISTS "content_hash"
    `);
  }
}
