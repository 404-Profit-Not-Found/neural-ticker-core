import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommentModeration1769630000000 implements MigrationInterface {
  name = 'AddCommentModeration1769630000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add moderation_status column (pending → ok | flagged)
    await queryRunner.query(`
      ALTER TABLE "comments"
      ADD COLUMN IF NOT EXISTS "moderation_status" TEXT NOT NULL DEFAULT 'pending'
    `);

    // Add optional reason field populated by LLM
    await queryRunner.query(`
      ALTER TABLE "comments"
      ADD COLUMN IF NOT EXISTS "moderation_reason" TEXT
    `);

    // Index for efficient pending-comment queries in the moderation cron
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_comments_moderation_status"
      ON "comments" ("moderation_status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_comments_moderation_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "comments" DROP COLUMN IF EXISTS "moderation_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "comments" DROP COLUMN IF EXISTS "moderation_status"`,
    );
  }
}
