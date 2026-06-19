import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * portfolio_analyses.userId referenced users(id) WITHOUT ON DELETE CASCADE, so
 * hard-deleting a user (e.g. waitlist rejection) would either fail on the FK or
 * leave orphaned analyses. Re-create the FK with ON DELETE CASCADE.
 *
 * The original constraint name is TypeORM-auto-generated and unpredictable, so
 * we look it up from information_schema. The whole thing is guarded to be a
 * no-op when the table/column does not exist yet.
 */
export class AddCascadeToPortfolioAnalyses1769660000000
  implements MigrationInterface
{
  name = 'AddCascadeToPortfolioAnalyses1769660000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        fk_name text;
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'portfolio_analyses' AND column_name = 'userId'
        ) THEN
          RETURN;
        END IF;

        SELECT tc.constraint_name INTO fk_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = 'portfolio_analyses'
          AND kcu.column_name = 'userId'
        LIMIT 1;

        IF fk_name IS NOT NULL THEN
          EXECUTE format(
            'ALTER TABLE "portfolio_analyses" DROP CONSTRAINT %I',
            fk_name
          );
        END IF;

        ALTER TABLE "portfolio_analyses"
          ADD CONSTRAINT "FK_portfolio_analyses_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_portfolio_analyses_user'
            AND table_name = 'portfolio_analyses'
        ) THEN
          ALTER TABLE "portfolio_analyses"
            DROP CONSTRAINT "FK_portfolio_analyses_user";
          ALTER TABLE "portfolio_analyses"
            ADD CONSTRAINT "FK_portfolio_analyses_user"
            FOREIGN KEY ("userId") REFERENCES "users"("id");
        END IF;
      END $$;
    `);
  }
}
