import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePushSubscriptions1769610000000 implements MigrationInterface {
  name = 'CreatePushSubscriptions1769610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "push_subscriptions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "endpoint" TEXT NOT NULL,
        "p256dh" TEXT NOT NULL,
        "auth" TEXT NOT NULL,
        "user_agent" TEXT,
        "created_at" TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_push_subscriptions_endpoint"
      ON "push_subscriptions" ("endpoint")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_push_subscriptions_user"
      ON "push_subscriptions" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "push_subscriptions"`);
  }
}
