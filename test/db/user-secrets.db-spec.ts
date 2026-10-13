import { randomBytes } from 'crypto';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AllowedUser } from '../../src/modules/users/entities/allowed-user.entity';
import { User } from '../../src/modules/users/entities/user.entity';
import { SecretBox } from '../../src/modules/users/secret-box.service';
import { UsersService } from '../../src/modules/users/users.service';
import {
  describeDb,
  ensureMigrated,
  openDataSource,
  truncateAll,
} from './support/test-db';

/**
 * A user's personal Gemini API key at rest, on a real PostgreSQL: the new
 * column, writes and reads through the real UsersService, the start-up
 * backfill (idempotent, two instances at once) and key rotation.
 */
describeDb('personal API keys at rest (real PostgreSQL)', () => {
  let ds: DataSource;
  // Throwaway keys, generated per run.
  const K1 = randomBytes(32).toString('base64');
  const K2 = randomBytes(32).toString('base64');
  const secret = (n: number) =>
    `AIza-not-a-real-key-${String(n).padStart(4, '0')}`;

  const box = (keys?: string) =>
    new SecretBox({
      get: (name: string) => (name === 'userSecrets.keys' ? keys : undefined),
    } as any);
  const usersService = (keys?: string) =>
    new UsersService(
      { generate: () => 'Nick' } as any,
      ds.getRepository(User),
      ds.getRepository(AllowedUser),
      box(keys),
    );
  const addUser = async (
    name: string,
    preferences: unknown = null,
  ): Promise<string> =>
    (
      await ds.query(
        `INSERT INTO users (email, nickname, preferences) VALUES ($1, $2, $3::jsonb) RETURNING id`,
        [
          `${name}@example.test`,
          name,
          preferences === null ? null : JSON.stringify(preferences),
        ],
      )
    )[0].id;
  const row = async (
    id: string,
  ): Promise<{ preferences: any; enc: string | null }> =>
    (
      await ds.query(
        `SELECT preferences, gemini_api_key_enc AS enc FROM users WHERE id = $1`,
        [id],
      )
    )[0];
  /** Everything a log call was given, as one string. */
  let logLines: string[];
  const captureLogs = () => {
    logLines = [];
    for (const level of ['log', 'warn', 'error'] as const) {
      jest
        .spyOn(Logger.prototype, level)
        .mockImplementation((...args: unknown[]) => {
          logLines.push(`${level}: ${args.map(String).join(' ')}`);
        });
    }
  };

  beforeAll(async () => {
    await ensureMigrated();
    ds = await openDataSource();
  });
  afterAll(async () => {
    await ds?.destroy();
  });
  beforeEach(async () => {
    await truncateAll(ds);
    captureLogs();
  });
  afterEach(() => jest.restoreAllMocks());

  it('the migration added a nullable text column and nothing else to users', async () => {
    const [column] = await ds.query(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'gemini_api_key_enc'`,
    );
    expect(column).toEqual({
      data_type: 'text',
      is_nullable: 'YES',
      column_default: null,
    });
  });

  describe('USER_SECRETS_KEYS not set', () => {
    it('saving and reading a key works exactly as before: clear text in preferences, the column empty', async () => {
      const id = await addUser('plain', { language: 'en' });
      const service = usersService(undefined);

      const view = await service.updatePreferences(id, {
        gemini_api_key: secret(1),
      });

      expect(await row(id)).toEqual({
        preferences: { language: 'en', gemini_api_key: secret(1) },
        enc: null,
      });
      expect(view.preferences).toEqual({
        language: 'en',
        gemini_api_key_set: true,
      });
      await expect(service.getUserLlmKey(id)).resolves.toBe(secret(1));
    });

    it('starting up warns once and changes no row', async () => {
      const id = await addUser('plain', { gemini_api_key: secret(1) });

      await usersService(undefined).onApplicationBootstrap();

      expect(logLines).toHaveLength(1);
      expect(logLines[0]).toContain('warn: USER_SECRETS_KEYS is not set');
      expect(await row(id)).toEqual({
        preferences: { gemini_api_key: secret(1) },
        enc: null,
      });
    });
  });

  describe('USER_SECRETS_KEYS set', () => {
    it('a saved key lands encrypted in the column; the clear text is gone from the row', async () => {
      const id = await addUser('enc', {
        language: 'en',
        gemini_api_key: 'OLD-CLEAR-TEXT',
      });
      const service = usersService(`k1:${K1}`);

      const view = await service.updatePreferences(id, {
        gemini_api_key: secret(1),
      });

      const stored = await row(id);
      expect(stored.preferences).toEqual({ language: 'en' });
      expect(stored.enc).toMatch(/^v1:k1:/);
      expect(JSON.stringify(stored)).not.toContain(secret(1));
      expect(JSON.stringify(stored)).not.toContain('OLD-CLEAR-TEXT');
      expect(box(`k1:${K1}`).decrypt(stored.enc!, id)).toBe(secret(1));
      // The whole users row, as text: no trace of the key.
      const [{ dump }] = await ds.query(
        `SELECT row_to_json(u)::text AS dump FROM users u WHERE id = $1`,
        [id],
      );
      expect(dump).not.toContain(secret(1));

      expect(view.preferences).toEqual({
        language: 'en',
        gemini_api_key_set: true,
      });
      expect(JSON.stringify(view)).not.toContain('v1:k1:');
      await expect(service.getUserLlmKey(id)).resolves.toBe(secret(1));
    });

    it('every account view reports "set" and none carries the ciphertext', async () => {
      const id = await addUser('views');
      const service = usersService(`k1:${K1}`);
      await service.updatePreferences(id, { gemini_api_key: secret(1) });

      const views = [
        await service.getProfile(id),
        await service.updateProfile(id, { theme: 'g10' } as any),
        ...(await service.findAll()),
      ];

      for (const view of views) {
        expect((view as any).preferences.gemini_api_key_set).toBe(true);
        const json = JSON.stringify(view);
        expect(json).not.toContain('v1:k1:');
        expect(json).not.toContain('gemini_api_key_enc');
        expect(json).not.toContain(secret(1));
      }
      // …and a later unrelated save keeps the key.
      await expect(service.getUserLlmKey(id)).resolves.toBe(secret(1));
    });

    it('a ciphertext copied onto another user’s row is not that user’s key', async () => {
      const alice = await addUser('alice');
      const mallory = await addUser('mallory');
      const service = usersService(`k1:${K1}`);
      await service.updatePreferences(alice, { gemini_api_key: secret(1) });

      await ds.query(
        `UPDATE users SET gemini_api_key_enc = (SELECT gemini_api_key_enc FROM users WHERE id = $1) WHERE id = $2`,
        [alice, mallory],
      );

      await expect(service.getUserLlmKey(mallory)).resolves.toBeNull();
      await expect(service.getUserLlmKey(alice)).resolves.toBe(secret(1));
      expect(logLines).toEqual([
        `warn: Personal API key of user ${mallory} could not be decrypted; using the system key.`,
      ]);
    });

    it('a row edited in the database (tampering) is "no personal key", not an error', async () => {
      const id = await addUser('tamper');
      const service = usersService(`k1:${K1}`);
      await service.updatePreferences(id, { gemini_api_key: secret(1) });
      await ds.query(
        `UPDATE users SET gemini_api_key_enc = overlay(gemini_api_key_enc placing 'AAAA' from length(gemini_api_key_enc) - 5) WHERE id = $1`,
        [id],
      );

      await expect(service.getUserLlmKey(id)).resolves.toBeNull();
    });

    it('lost key: a deployment without the key that encrypted a value treats it as "none" and says which user', async () => {
      const id = await addUser('lost');
      await usersService(`k1:${K1}`).updatePreferences(id, {
        gemini_api_key: secret(1),
      });
      logLines.length = 0;

      await expect(
        usersService(`k2:${K2}`).getUserLlmKey(id),
      ).resolves.toBeNull();
      await expect(
        usersService(undefined).getUserLlmKey(id),
      ).resolves.toBeNull();

      expect(logLines).toHaveLength(2);
      for (const line of logLines) {
        expect(line).toContain(id);
        expect(line).not.toContain('v1:');
        expect(line).not.toContain('AIza');
      }
      // Nothing was destroyed: with the key back, the value is readable again.
      await expect(
        usersService(`k2:${K2},k1:${K1}`).getUserLlmKey(id),
      ).resolves.toBe(secret(1));
    });
  });

  describe('backfill when the application starts', () => {
    const seed = async () => ({
      a: await addUser('a', { language: 'en', gemini_api_key: secret(1) }),
      b: await addUser('b', {
        gemini_api_key: secret(2),
        notifications: { push: true },
      }),
      empty: await addUser('empty', { gemini_api_key: '', language: 'sk' }),
      nulled: await addUser('nulled', { gemini_api_key: null }),
      weird: await addUser('weird', { gemini_api_key: { nested: true } }),
      none: await addUser('none', { language: 'en' }),
      noprefs: await addUser('noprefs', null),
    });

    it('moves every clear-text key into the column and removes it from preferences; logs counts only', async () => {
      const ids = await seed();
      const service = usersService(`k1:${K1}`);

      await service.onApplicationBootstrap();

      const reader = box(`k1:${K1}`);
      const a = await row(ids.a);
      expect(a.preferences).toEqual({ language: 'en' });
      expect(reader.decrypt(a.enc!, ids.a)).toBe(secret(1));
      const b = await row(ids.b);
      expect(b.preferences).toEqual({ notifications: { push: true } });
      expect(reader.decrypt(b.enc!, ids.b)).toBe(secret(2));
      // "" / null meant "no key": the entry is removed, nothing is encrypted
      expect(await row(ids.empty)).toEqual({
        preferences: { language: 'sk' },
        enc: null,
      });
      expect(await row(ids.nulled)).toEqual({ preferences: {}, enc: null });
      // not a string: left alone
      expect(await row(ids.weird)).toEqual({
        preferences: { gemini_api_key: { nested: true } },
        enc: null,
      });
      expect(await row(ids.none)).toEqual({
        preferences: { language: 'en' },
        enc: null,
      });
      expect(await row(ids.noprefs)).toEqual({ preferences: null, enc: null });

      expect(logLines).toEqual([
        'log: Personal API keys at rest: 2 encrypted now, 2 empty value(s) removed, 1 skipped; ' +
          '0 re-encrypted with the active key, 0 could not be decrypted.',
      ]);
      // No clear-text key is left anywhere in the table.
      const [{ n }] = await ds.query(
        `SELECT count(*)::int AS n FROM users u WHERE row_to_json(u)::text LIKE '%AIza%'`,
      );
      expect(n).toBe(0);
      await expect(service.getUserLlmKey(ids.a)).resolves.toBe(secret(1));
    });

    it('is idempotent: a second start changes nothing and encrypts nothing', async () => {
      const ids = await seed();
      await usersService(`k1:${K1}`).onApplicationBootstrap();
      const before = await ds.query(
        `SELECT id, preferences, gemini_api_key_enc FROM users ORDER BY id`,
      );
      logLines.length = 0;

      await usersService(`k1:${K1}`).onApplicationBootstrap();

      expect(
        await ds.query(
          `SELECT id, preferences, gemini_api_key_enc FROM users ORDER BY id`,
        ),
      ).toEqual(before);
      expect(logLines).toEqual([
        'log: Personal API keys at rest: 0 encrypted now, 0 empty value(s) removed, 1 skipped; ' +
          '0 re-encrypted with the active key, 0 could not be decrypted.',
      ]);
      expect(ids.a).toBeTruthy();
    });

    it('two instances starting at the same time: each key is moved once and stays readable', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 60; i++) {
        ids.push(await addUser(`u${i}`, { gemini_api_key: secret(i) }));
      }

      const [one, two] = await Promise.all([
        usersService(`k1:${K1}`).backfillLlmKeys(7),
        usersService(`k1:${K1}`).backfillLlmKeys(11),
      ]);

      expect(one.encrypted + two.encrypted).toBe(60);
      const service = usersService(`k1:${K1}`);
      for (let i = 0; i < ids.length; i++) {
        await expect(service.getUserLlmKey(ids[i])).resolves.toBe(secret(i));
      }
      const [{ plaintext }] = await ds.query(
        `SELECT count(*)::int AS plaintext FROM users WHERE jsonb_exists(preferences, 'gemini_api_key')`,
      );
      expect(plaintext).toBe(0);
    });

    it('pages through more rows than one batch', async () => {
      for (let i = 0; i < 23; i++)
        await addUser(`p${i}`, { gemini_api_key: secret(i) });

      await expect(
        usersService(`k1:${K1}`).backfillLlmKeys(5),
      ).resolves.toEqual({
        encrypted: 23,
        cleared: 0,
        skipped: 0,
      });
    });

    it('a key saved in clear text while encryption was switched off replaces the stale ciphertext when it is switched on again', async () => {
      const id = await addUser('downgrade');
      await usersService(`k1:${K1}`).updatePreferences(id, {
        gemini_api_key: secret(1),
      });
      // keys removed from the environment; the user saves a new key
      await usersService(undefined).updatePreferences(id, {
        gemini_api_key: secret(2),
      });
      expect(await row(id)).toEqual({
        preferences: { gemini_api_key: secret(2) },
        enc: null,
      });

      // keys configured again
      const service = usersService(`k1:${K1}`);
      await service.onApplicationBootstrap();

      await expect(service.getUserLlmKey(id)).resolves.toBe(secret(2));
      expect((await row(id)).preferences).toEqual({});
    });
  });

  describe('key rotation', () => {
    it('with the new key first, a start re-encrypts everything under the old key; then the old key can go', async () => {
      const ids: string[] = [];
      const before = usersService(`k1:${K1}`);
      for (let i = 0; i < 12; i++) {
        const id = await addUser(`r${i}`);
        await before.updatePreferences(id, { gemini_api_key: secret(i) });
        ids.push(id);
      }
      logLines.length = 0;

      await usersService(`k2:${K2},k1:${K1}`).onApplicationBootstrap();

      expect(logLines).toEqual([
        'log: Personal API keys at rest: 0 encrypted now, 0 empty value(s) removed, 0 skipped; ' +
          '12 re-encrypted with the active key, 0 could not be decrypted.',
      ]);
      const [{ old }] = await ds.query(
        `SELECT count(*)::int AS old FROM users WHERE gemini_api_key_enc LIKE 'v1:k1:%'`,
      );
      expect(old).toBe(0);
      // The old key is no longer needed.
      const afterRotation = usersService(`k2:${K2}`);
      for (let i = 0; i < ids.length; i++) {
        await expect(afterRotation.getUserLlmKey(ids[i])).resolves.toBe(
          secret(i),
        );
      }
      // And running it again does nothing.
      await expect(
        usersService(`k2:${K2},k1:${K1}`).reencryptLlmKeys(),
      ).resolves.toEqual({
        reencrypted: 0,
        undecryptable: 0,
      });
    });

    it('a value whose key is gone is counted and left exactly as it is', async () => {
      const id = await addUser('gone');
      await usersService(`k1:${K1}`).updatePreferences(id, {
        gemini_api_key: secret(1),
      });
      const before = (await row(id)).enc;

      await expect(
        usersService(`k2:${K2}`).reencryptLlmKeys(),
      ).resolves.toEqual({
        reencrypted: 0,
        undecryptable: 1,
      });

      expect((await row(id)).enc).toBe(before);
    });

    it('key ids with "_" are matched literally, not as a LIKE wildcard', async () => {
      const id = await addUser('underscore');
      await usersService(`k_1:${K1}`).updatePreferences(id, {
        gemini_api_key: secret(1),
      });

      // "kx1" would match the pattern "k_1" under LIKE
      await expect(
        usersService(`kx1:${K2},k_1:${K1}`).reencryptLlmKeys(),
      ).resolves.toEqual({
        reencrypted: 1,
        undecryptable: 0,
      });
      expect((await row(id)).enc).toMatch(/^v1:kx1:/);
    });
  });
});
