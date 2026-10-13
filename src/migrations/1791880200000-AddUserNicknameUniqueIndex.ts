import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nicknames are unique case-insensitively ("Trader" = "trader") — until now
 * only by a check in the application before saving, which two simultaneous
 * requests can both pass. This adds the database's own guarantee:
 *
 *   CREATE UNIQUE INDEX uq_users_nickname_lower ON users (LOWER(nickname))
 *
 * (NULL nicknames are not compared with each other, so accounts without one
 * are unaffected.)
 *
 * IT MUST NOT FAIL ON EXISTING DATA. Generated nicknames come from about
 * 400,000 combinations and were never checked against each other, so
 * duplicates may exist. When they do, the index is NOT created: the migration
 * logs a warning with the number of duplicated nicknames and the statement to
 * run once they have been resolved, and completes normally. Nothing is
 * renamed, deleted or otherwise changed by it.
 *
 * `users` is small, so building the index (which blocks writes to the table
 * while it runs) takes milliseconds.
 */
export class AddUserNicknameUniqueIndex1791880200000 implements MigrationInterface {
  name = 'AddUserNicknameUniqueIndex1791880200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const logger = new Logger('AddUserNicknameUniqueIndex');

    const [{ present }] = await queryRunner.query(
      `SELECT to_regclass('"users"') IS NOT NULL AS present`,
    );
    if (!present) return;

    const duplicates: { nickname: string; accounts: number }[] =
      await queryRunner.query(`
        SELECT LOWER("nickname") AS nickname, COUNT(*)::int AS accounts
          FROM "users"
         WHERE "nickname" IS NOT NULL
         GROUP BY LOWER("nickname")
        HAVING COUNT(*) > 1
         ORDER BY COUNT(*) DESC, LOWER("nickname")
      `);

    if (duplicates.length > 0) {
      const accounts = duplicates.reduce((sum, d) => sum + d.accounts, 0);
      logger.warn(
        `users.nickname: ${duplicates.length} nickname(s) are used by more than one ` +
          `account (${accounts} accounts in all, compared case-insensitively), e.g. ` +
          `${duplicates
            .slice(0, 5)
            .map((d) => `"${d.nickname}" x${d.accounts}`)
            .join(', ')}. ` +
          `The unique index was NOT created and nothing was changed. Give the ` +
          `duplicates distinct nicknames, then run: CREATE UNIQUE INDEX ` +
          `"uq_users_nickname_lower" ON "users" (LOWER("nickname"));`,
      );
      return;
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_nickname_lower"
      ON "users" (LOWER("nickname"))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_users_nickname_lower"`);
  }
}
