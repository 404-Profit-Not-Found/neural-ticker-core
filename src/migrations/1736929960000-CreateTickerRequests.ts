import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTickerRequests1736929960000 implements MigrationInterface {
  name = 'CreateTickerRequests1736929960000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure uuid extension is enabled
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Create ticker_requests table if it doesn't exist
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ticker_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "symbol" text NOT NULL,
        "status" text NOT NULL DEFAULT 'PENDING',
        "user_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        PRIMARY KEY ("id")
      )
    `);

    // Add foreign key constraint if it doesn't exist
    // We check if it exists first to avoid error if it was partially synced
    const constraintCheck = await queryRunner.query(`
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'FK_ticker_requests_user'
    `);

    if (constraintCheck.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "ticker_requests" 
        ADD CONSTRAINT "FK_ticker_requests_user" 
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      `);
    }

    // Add index for searching pending requests
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ticker_requests_symbol_status" 
      ON "ticker_requests" ("symbol", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ticker_requests_symbol_status"`);
    await queryRunner.query(`ALTER TABLE "ticker_requests" DROP CONSTRAINT IF EXISTS "FK_ticker_requests_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ticker_requests"`);
  }
}
