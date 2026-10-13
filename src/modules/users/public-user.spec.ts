import { User } from './entities/user.entity';
import { toolJson } from '../mcp/dto/serializers';
import {
  ADMIN_USER_SUMMARY_FIELDS,
  PUBLIC_USER_FIELDS,
  redactPreferences,
  toAccountUser,
  toAdminUserSummary,
  toPublicUser,
  userColumns,
  withPublicUser,
} from './public-user';

describe('public-user', () => {
  // A real entity instance (as TypeORM hydrates it) carrying everything that
  // must never reach another user.
  const makeUser = (overrides: Partial<User> = {}): User =>
    Object.assign(new User(), {
      id: '3f9a1c2e-0000-4000-8000-000000000001',
      email: 'alice.private@example.com',
      google_id: 'google-sub-1234567890',
      full_name: 'Alice Private',
      role: 'user',
      tier: 'pro',
      credits_balance: 4242,
      credits_reset_at: new Date('2026-01-01T00:00:00Z'),
      avatar_url: 'https://cdn.example.com/a.png',
      created_at: new Date('2025-01-01T00:00:00Z'),
      updated_at: new Date('2025-06-01T00:00:00Z'),
      last_login: new Date('2026-10-01T00:00:00Z'),
      preferences: {
        gemini_api_key: 'SECRET',
        language: 'sk',
        notifications: { push_enabled: true },
      },
      nickname: 'FunnyPanda123',
      view_mode: 'PRO',
      has_onboarded: true,
      theme: 'dark',
      ...overrides,
    });

  const PRIVATE_VALUES = [
    'SECRET',
    'alice.private@example.com',
    'alice.private',
    'google-sub-1234567890',
    'Alice Private',
    '4242',
  ];

  const expectNoPrivateData = (value: unknown) => {
    const json = JSON.stringify(value);
    for (const secret of PRIVATE_VALUES) {
      expect(json).not.toContain(secret);
    }
  };

  describe('toPublicUser', () => {
    it('returns ONLY the public fields', () => {
      const result = toPublicUser(makeUser());

      expect(result).toEqual({
        id: '3f9a1c2e-0000-4000-8000-000000000001',
        nickname: 'FunnyPanda123',
        avatar_url: 'https://cdn.example.com/a.png',
        tier: 'pro',
      });
      expect(Object.keys(result as object).sort()).toEqual(
        [...PUBLIC_USER_FIELDS].sort(),
      );
      expectNoPrivateData(result);
    });

    it('is an allow-list: a field added to the row later stays private', () => {
      const user = makeUser();
      (user as any).some_future_column = 'SECRET';

      expect(Object.keys(toPublicUser(user) as object).sort()).toEqual(
        [...PUBLIC_USER_FIELDS].sort(),
      );
    });

    it('returns null when there is no user (system notes)', () => {
      expect(toPublicUser(null)).toBeNull();
      expect(toPublicUser(undefined)).toBeNull();
    });

    it('falls back to an id-derived nickname — never the email', () => {
      for (const nickname of [null, undefined, '']) {
        const result = toPublicUser(makeUser({ nickname: nickname as any }));

        expect(result?.nickname).toBe('Trader-3f9a1c');
        expectNoPrivateData(result);
      }
    });

    it('normalizes a missing avatar to null', () => {
      expect(
        toPublicUser(makeUser({ avatar_url: undefined as any }))?.avatar_url,
      ).toBeNull();
    });
  });

  describe('userColumns', () => {
    it('qualifies the public columns for a joined alias', () => {
      expect(userColumns('user')).toEqual([
        'user.id',
        'user.nickname',
        'user.avatar_url',
        'user.tier',
      ]);
    });

    it('never offers a private column in either field set', () => {
      for (const fields of [PUBLIC_USER_FIELDS, ADMIN_USER_SUMMARY_FIELDS]) {
        for (const forbidden of [
          'google_id',
          'preferences',
          'credits_balance',
          'last_login',
        ]) {
          expect(fields).not.toContain(forbidden);
        }
      }
      expect(PUBLIC_USER_FIELDS).not.toContain('email');
      expect(PUBLIC_USER_FIELDS).not.toContain('full_name');
    });
  });

  describe('withPublicUser', () => {
    it('replaces an embedded author with the public view', () => {
      const note = { id: '7', title: 'T', user_id: 'u', user: makeUser() };

      const result = withPublicUser(note);

      expect(result).toEqual({
        id: '7',
        title: 'T',
        user_id: 'u',
        user: {
          id: '3f9a1c2e-0000-4000-8000-000000000001',
          nickname: 'FunnyPanda123',
          avatar_url: 'https://cdn.example.com/a.png',
          tier: 'pro',
        },
      });
      expectNoPrivateData(result);
    });

    it('keeps a missing author as null', () => {
      expect(withPublicUser({ id: '7', user: null }).user).toBeNull();
    });
  });

  describe('toAdminUserSummary', () => {
    it('adds contact fields but still no secrets, google id or credits', () => {
      const result = toAdminUserSummary(makeUser());

      expect(result).toEqual({
        id: '3f9a1c2e-0000-4000-8000-000000000001',
        nickname: 'FunnyPanda123',
        avatar_url: 'https://cdn.example.com/a.png',
        tier: 'pro',
        email: 'alice.private@example.com',
        full_name: 'Alice Private',
      });
      const json = JSON.stringify(result);
      expect(json).not.toContain('SECRET');
      expect(json).not.toContain('google-sub-1234567890');
      expect(json).not.toContain('4242');
    });

    it('returns null when there is no user', () => {
      expect(toAdminUserSummary(null)).toBeNull();
    });
  });

  describe('redactPreferences', () => {
    it('drops secret values and reports them as "<key>_set"', () => {
      expect(
        redactPreferences({
          gemini_api_key: 'SECRET',
          some_token: 'SECRET',
          db_password: 'SECRET',
          client_secret: 'SECRET',
          empty_api_key: '',
          language: 'sk',
        }),
      ).toEqual({
        gemini_api_key_set: true,
        some_token_set: true,
        db_password_set: true,
        client_secret_set: true,
        language: 'sk',
      });
    });

    it('passes through missing preferences', () => {
      expect(redactPreferences(null)).toBeNull();
      expect(redactPreferences(undefined)).toBeUndefined();
    });
  });

  describe('toAccountUser', () => {
    it('keeps the account fields but never a secret preference value', () => {
      const user = makeUser();

      const result = toAccountUser(user);
      const json = JSON.parse(JSON.stringify(result));

      expect(json.email).toBe('alice.private@example.com');
      expect(json.credits_balance).toBe(4242);
      expect(json.role).toBe('user');
      expect(json.preferences).toEqual({
        gemini_api_key_set: true,
        language: 'sk',
        notifications: { push_enabled: true },
      });
      expect(JSON.stringify(result)).not.toContain('SECRET');
    });

    it('does not mutate the entity the server keeps using', () => {
      const user = makeUser();

      toAccountUser(user);

      expect(user.preferences.gemini_api_key).toBe('SECRET');
    });

    it('returns null for a missing user', () => {
      expect(toAccountUser(null)).toBeNull();
    });
  });

  describe('User.toJSON (structural guard)', () => {
    it('serializes an entity as its public view only', () => {
      const user = makeUser();

      expect(JSON.parse(JSON.stringify(user))).toEqual({
        id: '3f9a1c2e-0000-4000-8000-000000000001',
        nickname: 'FunnyPanda123',
        avatar_url: 'https://cdn.example.com/a.png',
        tier: 'pro',
      });
      expectNoPrivateData(user);
    });

    it('covers an entity embedded at any depth of a response', () => {
      const response = {
        data: [
          {
            id: '1',
            user: makeUser(),
            replies: [{ id: '2', user: makeUser() }],
          },
        ],
        // A spread keeps the nested instance, so it stays guarded too.
        spread: { ...{ id: '3', user: makeUser() } },
      };

      expectNoPrivateData(response);
    });

    it('covers MCP tool results too (toJSON runs before the tool serializer replaces values)', () => {
      const { text } = toolJson({ rows: [{ id: 1, user: makeUser() }] })
        .content[0];

      expect(JSON.parse(text).rows[0].user).toEqual({
        id: '3f9a1c2e-0000-4000-8000-000000000001',
        nickname: 'FunnyPanda123',
        avatar_url: 'https://cdn.example.com/a.png',
        tier: 'pro',
      });
      expectNoPrivateData(JSON.parse(text));
    });

    it('leaves server-side property access untouched', () => {
      const user = makeUser();

      // The research pipeline reads the author's own key; auth reads the role.
      expect(user.preferences.gemini_api_key).toBe('SECRET');
      expect(user.email).toBe('alice.private@example.com');
      expect(user.credits_balance).toBe(4242);
      expect(user.role).toBe('user');
    });
  });
});
