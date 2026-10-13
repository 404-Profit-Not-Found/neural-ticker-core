import { ConflictException, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AllowedUser } from '../../src/modules/users/entities/allowed-user.entity';
import { User } from '../../src/modules/users/entities/user.entity';
import { CreditService } from '../../src/modules/users/credit.service';
import { SecretBox } from '../../src/modules/users/secret-box.service';
import { UsersService } from '../../src/modules/users/users.service';
import {
  describeDb,
  ensureMigrated,
  openDataSource,
  truncateAll,
} from './support/test-db';

const NICKNAME_MIGRATION = 'AddUserNicknameUniqueIndex1791880200000';

/**
 * Users on a real PostgreSQL: case-insensitive nickname uniqueness (the check
 * AND the unique index behind it), generated nicknames, the nickname-index
 * migration on data that already has duplicates, user search, and credit
 * refunds.
 */
describeDb('users: nicknames, search, credit refunds (real PostgreSQL)', () => {
  let ds: DataSource;
  const service = (generate: () => string = () => 'Generated1') =>
    new UsersService(
      { generate } as any,
      ds.getRepository(User),
      ds.getRepository(AllowedUser),
      new SecretBox({ get: () => undefined } as any),
    );
  const addUser = async (
    nickname: string | null,
    email = `${nickname ?? 'anon'}-${Math.random()}@example.test`,
  ): Promise<string> =>
    (
      await ds.query(
        `INSERT INTO users (email, nickname) VALUES ($1, $2) RETURNING id`,
        [email, nickname],
      )
    )[0].id;
  const nicknames = async (): Promise<(string | null)[]> =>
    (await ds.query(`SELECT nickname FROM users ORDER BY nickname`)).map(
      (r: any) => r.nickname,
    );
  const hasIndex = async (): Promise<boolean> =>
    (
      await ds.query(
        `SELECT to_regclass('uq_users_nickname_lower') IS NOT NULL AS present`,
      )
    )[0].present;

  beforeAll(async () => {
    await ensureMigrated();
    ds = await openDataSource({ extra: { max: 30 } } as any);
  });
  afterAll(async () => {
    await ds?.destroy();
  });
  beforeEach(async () => {
    await truncateAll(ds);
  });
  afterEach(() => jest.restoreAllMocks());

  describe('nickname uniqueness is case-insensitive', () => {
    it('a database built by the migrations has the unique index on LOWER(nickname)', async () => {
      const [index] = await ds.query(
        `SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_users_nickname_lower'`,
      );
      expect(index.indexdef).toBe(
        'CREATE UNIQUE INDEX uq_users_nickname_lower ON public.users USING btree (lower((nickname)::text))',
      );
    });

    it.each(['moonwalker', 'MOONWALKER', 'MoOnWaLkEr', 'Moonwalker'])(
      'changing to %j when someone is "Moonwalker" is a 409',
      async (wanted) => {
        await addUser('Moonwalker');
        const me = await addUser('Someone');

        await expect(
          service().updateProfile(me, { nickname: wanted }),
        ).rejects.toThrow(ConflictException);
        expect(await nicknames()).toEqual(['Moonwalker', 'Someone']);
      },
    );

    it('re-saving your own nickname, or changing only its case, is allowed', async () => {
      const me = await addUser('Moonwalker');

      await expect(
        service().updateProfile(me, {
          nickname: 'Moonwalker',
          theme: 'g10',
        } as any),
      ).resolves.toMatchObject({ nickname: 'Moonwalker' });
      await expect(
        service().updateProfile(me, { nickname: 'MOONWALKER' }),
      ).resolves.toMatchObject({ nickname: 'MOONWALKER' });
    });

    it('accounts without a nickname do not collide with each other', async () => {
      await addUser(null);
      await addUser(null);
      await addUser(null);
      expect(await nicknames()).toEqual([null, null, null]);
    });

    it('the database refuses a duplicate even when the application check is bypassed', async () => {
      await addUser('Moonwalker');
      await expect(addUser('moonwalker')).rejects.toMatchObject({
        code: '23505',
        constraint: 'uq_users_nickname_lower',
      });
    });

    // The check-then-save race the index exists for.
    it('two users changing to the same nickname AT THE SAME TIME: one gets it, the other a 409 — never two, never a 500', async () => {
      const ids = await Promise.all(
        Array.from({ length: 8 }, (_, i) => addUser(`user${i}`)),
      );

      const results = await Promise.allSettled(
        ids.map((id, i) =>
          service().updateProfile(id, {
            nickname: i % 2 ? 'wanted' : 'Wanted',
          }),
        ),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failures = results.filter((r) => r.status === 'rejected');
      expect(failures).toHaveLength(7);
      for (const failure of failures)
        expect(failure.reason).toBeInstanceOf(ConflictException);
      const [{ n }] = await ds.query(
        `SELECT count(*)::int AS n FROM users WHERE LOWER(nickname) = 'wanted'`,
      );
      expect(n).toBe(1);
    });
  });

  describe('generated nicknames (sign-up) never fail on the index', () => {
    const profile = (n: number) => ({
      email: `new${n}@example.test`,
      googleId: `google-${n}`,
      fullName: `New ${n}`,
      avatarUrl: '',
    });

    it('a generator that keeps proposing a taken name still yields a unique nickname', async () => {
      await addUser('SameName1');

      const created = await service(() => 'SameName1').createOrUpdateGoogleUser(
        profile(1),
      );

      expect(created.nickname).toMatch(/^SameName1[0-9a-f]{6}$/);
    });

    it('12 sign-ups at once whose generator proposes the SAME name: all succeed, all different', async () => {
      const users = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          service(() => 'Popular7').createOrUpdateGoogleUser(profile(i)),
        ),
      );

      const names = users.map((u) => u.nickname.toLowerCase());
      expect(new Set(names).size).toBe(12);
      expect(names.filter((n) => n === 'popular7')).toHaveLength(1);
      const [{ n }] = await ds.query(`SELECT count(*)::int AS n FROM users`);
      expect(n).toBe(12);
    });

    it('an existing account without a nickname gets an available one at its next login', async () => {
      await addUser('Taken9');
      await ds.query(
        `INSERT INTO users (email, google_id, nickname) VALUES ('old@example.test', 'google-old', NULL)`,
      );
      const proposals = ['Taken9', 'TAKEN9', 'Free10'];

      const user = await service(
        () => proposals.shift() ?? 'Free10',
      ).createOrUpdateGoogleUser({
        email: 'old@example.test',
        googleId: 'google-old',
        fullName: 'Old',
        avatarUrl: '',
      });

      expect(user.nickname).toBe('Free10');
    });
  });

  describe('the nickname-index migration on a database that already has duplicates', () => {
    const rerunMigration = async () => {
      await ds.query(`DELETE FROM migrations WHERE name = $1`, [
        NICKNAME_MIGRATION,
      ]);
      const fresh = await openDataSource();
      try {
        return (await fresh.runMigrations({ transaction: 'all' })).map(
          (m) => m.name,
        );
      } finally {
        await fresh.destroy();
      }
    };

    afterEach(async () => {
      // leave the schema as the migrations build it
      await ds.query(`DELETE FROM users`);
      await ds.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_nickname_lower" ON "users" (LOWER("nickname"))`,
      );
    });

    it('does not fail and changes nothing: it reports the duplicates and skips the index', async () => {
      await ds.query(`DROP INDEX "uq_users_nickname_lower"`);
      for (const nickname of [
        'Trader',
        'trader',
        'TRADER',
        'Solo',
        'Dup',
        'dup',
        null,
        null,
      ]) {
        await addUser(nickname);
      }
      const before = await ds.query(
        `SELECT id, nickname FROM users ORDER BY id`,
      );
      const warnings: string[] = [];
      jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation((message: any) => {
          warnings.push(String(message));
        });

      const executed = await rerunMigration();

      expect(executed).toEqual([NICKNAME_MIGRATION]);
      expect(await hasIndex()).toBe(false);
      expect(
        await ds.query(`SELECT id, nickname FROM users ORDER BY id`),
      ).toEqual(before);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(
        '2 nickname(s) are used by more than one account (5 accounts in all',
      );
      expect(warnings[0]).toContain('"trader" x3, "dup" x2');
      expect(warnings[0]).toContain(
        'The unique index was NOT created and nothing was changed',
      );
      expect(warnings[0]).toContain(
        'CREATE UNIQUE INDEX "uq_users_nickname_lower" ON "users" (LOWER("nickname"));',
      );
    });

    it('…and once the duplicates are resolved, the statement it printed creates the index', async () => {
      await ds.query(`DROP INDEX "uq_users_nickname_lower"`);
      await addUser('Trader');
      const dup = await addUser('trader');
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      await rerunMigration();
      expect(await hasIndex()).toBe(false);

      await ds.query(`UPDATE users SET nickname = 'Trader2' WHERE id = $1`, [
        dup,
      ]);
      await ds.query(
        `CREATE UNIQUE INDEX "uq_users_nickname_lower" ON "users" (LOWER("nickname"))`,
      );

      expect(await hasIndex()).toBe(true);
    });

    it('without duplicates it creates the index, and running it again is harmless', async () => {
      await ds.query(`DROP INDEX "uq_users_nickname_lower"`);
      await addUser('Trader');
      await addUser(null);
      await addUser(null);
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      await rerunMigration();
      expect(await hasIndex()).toBe(true);
      await rerunMigration();

      expect(await hasIndex()).toBe(true);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('searchUsers / findPublicByIds', () => {
    it('matches nicknames by prefix, case-insensitively, and treats % and _ literally', async () => {
      for (const n of ['Alpha', 'alphabet', 'Al_pha', 'Al%pha', 'Beta'])
        await addUser(n);

      const search = async (q: string) =>
        (await service().searchUsers(q)).map((u) => u.nickname).sort();

      expect(await search('alp')).toEqual(['Alpha', 'alphabet']);
      expect(await search('Al_')).toEqual(['Al_pha']);
      expect(await search('Al%')).toEqual(['Al%pha']);
      expect(await search('%')).toEqual([]);
      expect(await search('_')).toEqual([]);
      expect(await search('\\')).toEqual([]);
      expect(await search("'; DROP TABLE users; --")).toEqual([]);
      expect(
        (await ds.query(`SELECT count(*)::int AS n FROM users`))[0].n,
      ).toBe(5);
    });

    it('never matches on (or returns) an email address', async () => {
      await addUser('Nick', 'findme@secret.example');

      expect(await service().searchUsers('findme')).toEqual([]);
      const [hit] = await service().searchUsers('Nick');
      // What is serialized — and what was loaded: only the public columns.
      expect(Object.keys(JSON.parse(JSON.stringify(hit))).sort()).toEqual([
        'avatar_url',
        'id',
        'nickname',
        'tier',
      ]);
      expect((hit as any).email).toBeUndefined();
      expect((hit as any).preferences).toBeUndefined();
    });

    it('findPublicByIds ignores ids that are not UUIDs instead of failing the query', async () => {
      const id = await addUser('Real');

      const found = await service().findPublicByIds([
        id,
        'not-a-uuid',
        '-'.repeat(36),
        'abcdef0123'.repeat(4).slice(0, 36),
        '',
        "1' OR '1'='1",
      ]);

      expect(found.map((u) => u.nickname)).toEqual(['Real']);
      await expect(service().findPublicByIds(['nope'])).resolves.toEqual([]);
    });
  });

  describe('credit refunds', () => {
    let credits: CreditService;
    let userId: string;
    const balance = async () =>
      (
        await ds.query(`SELECT credits_balance AS b FROM users WHERE id = $1`, [
          userId,
        ])
      )[0].b;
    const ledger = async () =>
      ds.query(
        `SELECT amount, reason, metadata FROM credit_transactions WHERE user_id = $1 ORDER BY id`,
        [userId],
      );
    const research = (id: string) => ({
      spendMatch: {
        reason: 'research_spend' as const,
        metadataKey: 'research_id',
        metadataValue: id,
      },
    });

    beforeEach(async () => {
      credits = new CreditService(ds);
      userId = await addUser('Payer');
      await ds.query(`UPDATE users SET credits_balance = 42 WHERE id = $1`, [
        userId,
      ]);
    });

    it('gives back exactly what the spend for THAT ticket deducted, as its own ledger entry', async () => {
      await credits.deductCredits(userId, 5, 'research_spend', {
        research_id: '77',
        ticker: 'NVDA',
      });
      await credits.deductCredits(userId, 1, 'research_spend', {
        research_id: '7',
      });
      expect(await balance()).toBe(36);

      await expect(
        credits.refundCredits(userId, research('77'), {
          cause: 'LLM_UNAVAILABLE',
        }),
      ).resolves.toBe(5);

      expect(await balance()).toBe(41);
      const rows = await ledger();
      expect(rows.map((r: any) => [r.amount, r.reason])).toEqual([
        [-5, 'research_spend'],
        [-1, 'research_spend'],
        [5, 'refund'],
      ]);
      expect(rows[2].metadata).toMatchObject({
        cause: 'LLM_UNAVAILABLE',
        research_id: '77',
        spend_reason: 'research_spend',
      });
      expect(typeof rows[2].metadata.refund_of).toBe('string');
    });

    it('is idempotent per spend, also under 15 simultaneous calls', async () => {
      await credits.deductCredits(userId, 5, 'research_spend', {
        research_id: '77',
      });

      const results = await Promise.all(
        Array.from({ length: 15 }, () =>
          credits.refundCredits(userId, research('77')),
        ),
      );

      expect(results.filter((r) => r === 5)).toHaveLength(1);
      expect(results.filter((r) => r === 0)).toHaveLength(14);
      expect(await balance()).toBe(42);
      expect(
        (await ledger()).filter((r: any) => r.reason === 'refund'),
      ).toHaveLength(1);
    });

    it.each([
      ['a ticket that was never charged (admin, system)', '999'],
      ['a ticket id that is only a prefix of a charged one', '7'],
      ['a different kind of value', "77' OR '1'='1"],
    ])('refunds nothing for %s', async (_label, id) => {
      await credits.deductCredits(userId, 5, 'research_spend', {
        research_id: '77',
      });

      await expect(credits.refundCredits(userId, research(id))).resolves.toBe(
        0,
      );
      expect(await balance()).toBe(37);
    });

    it('does not refund another user’s spend, nor a spend of another kind', async () => {
      const other = await addUser('Other');
      await credits.deductCredits(userId, 5, 'research_spend', {
        research_id: '77',
      });
      await credits.deductCredits(userId, 2, 'portfolio_analysis_spend', {
        research_id: '88',
      });

      await expect(credits.refundCredits(other, research('77'))).resolves.toBe(
        0,
      );
      await expect(credits.refundCredits(userId, research('88'))).resolves.toBe(
        0,
      );
      expect(await balance()).toBe(35);
    });

    it('a known amount (portfolio / social analysis) is added back and recorded', async () => {
      await credits.deductCredits(userId, 2, 'portfolio_analysis_spend', {
        model: 'gemini',
      });

      await expect(
        credits.refundCredits(
          userId,
          { amount: 2 },
          {
            spend_reason: 'portfolio_analysis_spend',
            cause: 'LLM_UNAVAILABLE',
          },
        ),
      ).resolves.toBe(2);

      expect(await balance()).toBe(42);
      expect((await ledger()).at(-1)).toMatchObject({
        amount: 2,
        reason: 'refund',
      });
    });

    it('a refund racing a new spend keeps the balance right (both lock the user row)', async () => {
      await credits.deductCredits(userId, 5, 'research_spend', {
        research_id: '77',
      });

      await Promise.all([
        credits.refundCredits(userId, research('77')),
        credits.deductCredits(userId, 3, 'research_spend', {
          research_id: '78',
        }),
        credits.deductCredits(userId, 4, 'research_spend', {
          research_id: '79',
        }),
      ]);

      expect(await balance()).toBe(42 - 5 + 5 - 3 - 4);
    });
  });
});
