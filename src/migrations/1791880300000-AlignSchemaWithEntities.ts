import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Closes the two differences between a migrated database and the entities
 * that are more than a matter of names:
 *
 *   stocktwits_analyses.ticker_id → tickers(id) ON DELETE CASCADE
 *   event_calendar.ticker_id      → tickers(id) ON DELETE CASCADE
 *
 * The entities have always declared these foreign keys, but the migration
 * that creates the two tables (SyncMissingTables) does not: in a database
 * built by migrations, deleting a ticker left its StockTwits analyses and
 * calendar events behind. (Every other difference was a naming / nullability
 * / timestamp-type one and was resolved the other way round, by making the
 * ENTITIES describe the database.)
 *
 * Safe on a populated database:
 *   - each key is added NOT VALID first — a catalogue change that neither
 *     scans the table nor blocks it for more than an instant, and from then on
 *     new and updated rows are checked;
 *   - it is then VALIDATED only when no existing row points at a ticker that
 *     no longer exists. If such orphans exist, their number is logged and the
 *     key stays NOT VALID: nothing is deleted and the migration does not fail.
 *     Clean them up and run the statement printed in the warning.
 *   - it does nothing when the constraint (or any foreign key on that column)
 *     is already there, e.g. where TypeORM `synchronize` created the table.
 *
 * It also creates the index on `symbol` the two entities declare (both tables
 * are queried by symbol); IF NOT EXISTS, on two small tables.
 */
const KEYS = [
  {
    table: 'stocktwits_analyses',
    constraint: 'FK_1c6e5ad63e17b3dd268a5baf3be',
    symbolIndex: 'IDX_a41c04ce5c45b395cc0bd647a8',
  },
  {
    table: 'event_calendar',
    constraint: 'FK_cf19f0813c5353475930eba56a7',
    symbolIndex: 'IDX_7715ea445326de88e8080baf7e',
  },
] as const;

export class AlignSchemaWithEntities1791880300000 implements MigrationInterface {
  name = 'AlignSchemaWithEntities1791880300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const logger = new Logger('AlignSchemaWithEntities');

    for (const { table, constraint, symbolIndex } of KEYS) {
      const [{ present }] = await queryRunner.query(
        `SELECT to_regclass($1::text) IS NOT NULL
                AND to_regclass('"tickers"') IS NOT NULL AS present`,
        [`"${table}"`],
      );
      if (!present) continue;

      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "${symbolIndex}" ON "${table}" ("symbol")`,
      );

      // Any foreign key on ticker_id → tickers counts, whatever it is called.
      const existing: { conname: string; convalidated: boolean }[] =
        await queryRunner.query(
          `SELECT c.conname, c.convalidated
             FROM pg_constraint c
             JOIN pg_attribute a
               ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
            WHERE c.contype = 'f'
              AND c.conrelid = to_regclass($1::text)
              AND c.confrelid = to_regclass('"tickers"')
              AND a.attname = 'ticker_id'`,
          [`"${table}"`],
        );

      let name: string = constraint;
      let validated = false;
      if (existing.length > 0) {
        name = existing[0].conname;
        validated = existing[0].convalidated;
      } else {
        await queryRunner.query(
          `ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}"
             FOREIGN KEY ("ticker_id") REFERENCES "tickers" ("id")
             ON DELETE CASCADE NOT VALID`,
        );
      }
      if (validated) continue;

      const [{ orphans }] = await queryRunner.query(
        `SELECT count(*)::int AS orphans
           FROM "${table}" t
          WHERE t."ticker_id" IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM "tickers" k WHERE k."id" = t."ticker_id")`,
      );
      if (orphans > 0) {
        logger.warn(
          `${table}: ${orphans} row(s) reference a ticker that no longer exists. ` +
            `The foreign key "${name}" was added NOT VALID (it guards new rows) ` +
            `and nothing was deleted. After removing those rows, run: ` +
            `ALTER TABLE "${table}" VALIDATE CONSTRAINT "${name}";`,
        );
        continue;
      }
      await queryRunner.query(
        `ALTER TABLE "${table}" VALIDATE CONSTRAINT "${name}"`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { table, constraint, symbolIndex } of KEYS) {
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${table}" DROP CONSTRAINT IF EXISTS "${constraint}"`,
      );
      await queryRunner.query(`DROP INDEX IF EXISTS "${symbolIndex}"`);
    }
  }
}
