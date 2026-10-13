import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `users.gemini_api_key_enc`: the user's personal Gemini API key,
 * encrypted at rest (SecretBox — AES-256-GCM, `v1:<keyId>:<iv>:<tag>:<ct>`).
 * Until now the key sat in clear text inside the `preferences` JSON.
 *
 * Only the column is added here: nullable, no default, so PostgreSQL changes
 * the catalogue and rewrites nothing. No data is moved by the migration — the
 * encryption keys live in the application's environment, not in SQL. When
 * USER_SECRETS_KEYS is configured the application moves existing plaintext
 * keys into this column as it starts (UsersService.backfillLlmKeys); without
 * it nothing changes and the column stays empty.
 */
export class AddUserEncryptedLlmKey1791880100000 implements MigrationInterface {
  name = 'AddUserEncryptedLlmKey1791880100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE IF EXISTS "users"
      ADD COLUMN IF NOT EXISTS "gemini_api_key_enc" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Dropping the column destroys every encrypted key. Anyone reverting
    // should first decide what happens to them; the statement is here because
    // a migration must be reversible.
    await queryRunner.query(`
      ALTER TABLE IF EXISTS "users"
      DROP COLUMN IF EXISTS "gemini_api_key_enc"
    `);
  }
}
