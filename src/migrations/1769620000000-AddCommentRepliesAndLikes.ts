import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommentRepliesAndLikes1769620000000 implements MigrationInterface {
  name = 'AddCommentRepliesAndLikes1769620000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add parent_id to comments for threaded replies
    await queryRunner.query(`
      ALTER TABLE "comments"
      ADD COLUMN IF NOT EXISTS "parent_id" BIGINT REFERENCES "comments"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_comments_parent_id"
      ON "comments" ("parent_id")
    `);

    // 2. Create comment_likes table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "comment_likes" (
        "id" BIGSERIAL PRIMARY KEY,
        "comment_id" BIGINT NOT NULL REFERENCES "comments"("id") ON DELETE CASCADE,
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "created_at" TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_comment_likes_unique"
      ON "comment_likes" ("comment_id", "user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_comment_likes_comment"
      ON "comment_likes" ("comment_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "comment_likes"`);
    await queryRunner.query(
      `ALTER TABLE "comments" DROP COLUMN IF EXISTS "parent_id"`,
    );
  }
}
