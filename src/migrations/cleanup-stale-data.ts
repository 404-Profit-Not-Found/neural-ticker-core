import { MigrationInterface, QueryRunner } from 'typeorm';

export class CleanupStaleData1702312000000 implements MigrationInterface {
  name = 'CleanupStaleData1702312000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Clear research_notes and cascade to risk_analyses
    // Using CASCADE to ensure all dependent rows (like in risk_analyses) are deleted
    await queryRunner.query('TRUNCATE TABLE "research_notes" CASCADE');
    await queryRunner.query('TRUNCATE TABLE "risk_analyses" CASCADE');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Data deletion is irreversible
  }
}
