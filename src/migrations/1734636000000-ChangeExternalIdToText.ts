import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeExternalIdToText1734636000000 implements MigrationInterface {
  name = 'ChangeExternalIdToText1734636000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "company_news" ALTER COLUMN "external_id" TYPE text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "company_news" ALTER COLUMN "external_id" TYPE bigint USING external_id::bigint`,
    );
  }
}
