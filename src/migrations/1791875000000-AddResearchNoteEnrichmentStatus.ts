import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `enrichment_status` to research_notes (audit H4): the per-step outcome
 * of the best-effort enrichment that runs after a note is marked COMPLETED
 * (title, quality, risk_analysis, financials), so a note whose risk analysis
 * or financials silently failed can be told apart from a fully enriched one.
 *
 * Nullable with no default and no backfill: existing notes simply have no
 * recorded outcome. research_notes is created by TypeORM `synchronize`, not by
 * a migration, so the statements are guarded with IF [NOT] EXISTS to stay
 * idempotent on environments where synchronize already added the column.
 */
export class AddResearchNoteEnrichmentStatus1791875000000 implements MigrationInterface {
  name = 'AddResearchNoteEnrichmentStatus1791875000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE IF EXISTS "research_notes"
      ADD COLUMN IF NOT EXISTS "enrichment_status" JSONB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE IF EXISTS "research_notes"
      DROP COLUMN IF EXISTS "enrichment_status"
    `);
  }
}
