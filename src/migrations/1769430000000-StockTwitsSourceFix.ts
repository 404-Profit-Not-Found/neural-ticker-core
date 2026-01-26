import { MigrationInterface, QueryRunner } from 'typeorm';

export class StockTwitsSourceFix1769430000000 implements MigrationInterface {
  name = 'StockTwitsSourceFix1769430000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stocktwits_posts" ADD COLUMN IF NOT EXISTS "inserted_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stocktwits_posts" DROP COLUMN IF EXISTS "inserted_at"`,
    );
  }
}
