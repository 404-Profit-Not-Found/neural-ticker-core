import { MigrationInterface, QueryRunner } from 'typeorm';

export class CleanupStaleData1702312000000 implements MigrationInterface {
  name = 'CleanupStaleData1702312000000';

  public async up(_queryRunner: QueryRunner): Promise<void> {
    // Clear research_notes and cascade to risk_analyses
    // Using CASCADE to ensure all dependent rows (like in risk_analyses) are deleted
    await _queryRunner.query('TRUNCATE TABLE "research_notes" CASCADE');
    await _queryRunner.query('TRUNCATE TABLE "risk_analyses" CASCADE');
  }
  public down(_queryRunner: QueryRunner): Promise<void> {
    void _queryRunner; // no-op placeholder to satisfy interface
    // Data deletion is irreversible
    return Promise.resolve();
  }
}
