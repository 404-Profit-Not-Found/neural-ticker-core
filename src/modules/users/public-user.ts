import type { User } from './entities/user.entity';

/**
 * Client-facing views of a `User`.
 *
 * The `users` row carries data that must never reach another user: `email`,
 * `google_id`, `full_name`, `role`, `credits_balance`, `last_login` and above
 * all `preferences`, which can hold the user's personal LLM API key. Three
 * views exist, from least to most revealing:
 *
 *  - {@link toPublicUser}       what ANY other user (or an anonymous visitor
 *                               of a public endpoint) may see of an author.
 *  - {@link toAdminUserSummary} the public view + contact fields, for
 *                               admin-only listings that embed a user.
 *  - {@link toAccountUser}      the whole row minus secret preference values,
 *                               for the account's owner or an admin.
 *
 * `User.toJSON()` returns the PUBLIC view, so a `User` entity that reaches a
 * response by any other route (a relation someone joins later, a handler that
 * returns the entity as-is) still serializes safely. Server code that needs
 * the full row (the research pipeline reading the author's own API key,
 * ownership checks, credits) reads the entity's properties and is unaffected.
 */

/**
 * The public field set — an ALLOW-list, so a column added to `User` later is
 * private until it is listed here on purpose. It is exactly what the frontends
 * read from an embedded author (`.user?.nickname`, `.user?.avatar_url`,
 * `.user?.tier`), plus `id`, which backs `<@userId>` mention tokens.
 */
export const PUBLIC_USER_FIELDS = [
  'id',
  'nickname',
  'avatar_url',
  'tier',
] as const;

export interface PublicUser {
  id: string;
  nickname: string;
  avatar_url: string | null;
  tier: string;
}

/** Extra fields an admin sees next to an embedded user. */
export const ADMIN_USER_SUMMARY_FIELDS = [
  ...PUBLIC_USER_FIELDS,
  'email',
  'full_name',
] as const;

export interface AdminUserSummary extends PublicUser {
  email: string;
  full_name: string | null;
}

/**
 * The whole account row with secret preference values redacted, as a plain
 * object (so it is not subject to `User.toJSON()`).
 */
export type AccountUser = Omit<User, 'toJSON' | 'gemini_api_key_enc'>;

type UserLike = Partial<Omit<User, 'toJSON'>>;

/**
 * Qualified column list for `QueryBuilder.addSelect()` on a joined user, so a
 * query loads nothing beyond the fields it is allowed to return:
 * `qb.leftJoin('note.user', 'user').addSelect(userColumns('user'))`.
 */
export function userColumns(
  alias: string,
  fields: readonly string[] = PUBLIC_USER_FIELDS,
): string[] {
  return fields.map((field) => `${alias}.${field}`);
}

/**
 * Display name for a user who has no nickname. Nicknames are generated at
 * sign-up and back-filled at login, but the column is nullable, so a legacy
 * account that has not logged in since can still lack one. Derived from the
 * id — never from the email.
 */
function fallbackNickname(id: string | undefined): string {
  const suffix = String(id ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 6);
  return suffix ? `Trader-${suffix}` : 'Trader';
}

/** What any other user may see of `user`. `null` when there is no user. */
export function toPublicUser(
  user: UserLike | null | undefined,
): PublicUser | null {
  if (!user) return null;
  return {
    id: user.id as string,
    nickname: user.nickname || fallbackNickname(user.id),
    avatar_url: user.avatar_url ?? null,
    tier: user.tier ?? 'free',
  };
}

/** The public view plus contact fields. ADMIN-ONLY responses. */
export function toAdminUserSummary(
  user: UserLike | null | undefined,
): AdminUserSummary | null {
  const publicUser = toPublicUser(user);
  if (!user || !publicUser) return null;
  return {
    ...publicUser,
    email: user.email as string,
    full_name: user.full_name ?? null,
  };
}

/**
 * Replaces a loaded `user` relation with its public view. For rows returned
 * to a client that embed their author (research notes, comments).
 */
export function withPublicUser<T extends { user?: unknown }>(
  row: T,
): Omit<T, 'user'> & { user: PublicUser | null } {
  return { ...row, user: toPublicUser(row.user as UserLike | null) };
}

// Preference keys whose VALUES are secrets and must never be returned to a
// client (own profile or admin listing). The presence of a key is still
// surfaced as `<key>_set: true` so the UI can show "configured" state.
const SENSITIVE_PREF_PATTERN = /(api_key|secret|token|password)/i;

export function redactPreferences(
  preferences: Record<string, any> | null | undefined,
): Record<string, any> | null | undefined {
  if (!preferences) return preferences;
  const safe: Record<string, any> = {};
  for (const [key, value] of Object.entries(preferences)) {
    if (SENSITIVE_PREF_PATTERN.test(key)) {
      if (value != null && value !== '') safe[`${key}_set`] = true;
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

/**
 * The account as its OWNER or an ADMIN may see it: every column, with secret
 * preference values redacted. Never embed this in another user's response —
 * use {@link toPublicUser}. Does not mutate `user`.
 */
export function toAccountUser(user: User): AccountUser;
export function toAccountUser(
  user: User | null | undefined,
): AccountUser | null;
export function toAccountUser(
  user: User | null | undefined,
): AccountUser | null {
  if (!user) return null;
  // The encrypted personal key never leaves the server, not even as
  // ciphertext; that one is configured is reported the way it always was.
  const { gemini_api_key_enc: encryptedLlmKey, ...account } = user;
  const preferences = redactPreferences(user.preferences);
  return {
    ...account,
    preferences: (encryptedLlmKey
      ? { ...preferences, gemini_api_key_set: true }
      : preferences) as Record<string, any>,
  };
}
