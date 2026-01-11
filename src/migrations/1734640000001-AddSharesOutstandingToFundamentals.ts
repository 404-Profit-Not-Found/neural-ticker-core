import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSharesOutstandingToFundamentals1734640000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "shares_outstanding" numeric(24,2)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "fundamentals" DROP COLUMN IF EXISTS "shares_outstanding"`,
    );
  }
}
