import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertEventEnumsToText1769384377000 implements MigrationInterface {
  name = 'ConvertEventEnumsToText1769384377000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Convert event_type to text
    await queryRunner.query(
      `ALTER TABLE "event_calendar" ALTER COLUMN "event_type" TYPE text`,
    );

    // 2. Convert source to text
    await queryRunner.query(
      `ALTER TABLE "event_calendar" ALTER COLUMN "source" TYPE text`,
    );

    // 3. Cleanup old types (optional but cleaner)
    await queryRunner.query(
      `DROP TYPE IF EXISTS "event_calendar_event_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "event_calendar_source_enum"`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreating enums on down is possible but usually text is fine forever.
    // For safety, we just leave them as text.
  }
}
