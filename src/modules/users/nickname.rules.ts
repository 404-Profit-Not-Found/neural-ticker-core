/**
 * Rules for a nickname a user CHOOSES (PATCH /v1/users/me).
 *
 * A nickname is the only thing other users see of an author — comments,
 * research notes, @mentions — so it must not be usable to pose as someone
 * else: a conservative ASCII charset (no look-alike letters, no whitespace
 * tricks), no reserved / staff-sounding names, and unique regardless of case.
 *
 * These rules apply when a nickname is SET. Existing nicknames that predate
 * them keep working until their owner changes them.
 */
export const NICKNAME_MIN_LENGTH = 3;
export const NICKNAME_MAX_LENGTH = 24;

/** Letters, digits, `_`, `-`, `.`; first and last character alphanumeric. */
export const NICKNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

// Compared after lower-casing and dropping punctuation and trailing digits, so
// "Admin", "ad.min", "ADMIN_1" and "admin2024" are all "admin".
const RESERVED_NICKNAMES = new Set([
  'admin',
  'administrator',
  'root',
  'owner',
  'system',
  'support',
  'help',
  'helpdesk',
  'moderator',
  'mod',
  'staff',
  'team',
  'official',
  'security',
  'neuralticker',
  'neuralticket',
  'bot',
  // Names the UI itself shows when there is no author / nickname.
  'ai',
  'anonymous',
  'unknown',
  'someone',
  'trader',
  'user',
  'null',
  'undefined',
]);

// The handle generated for an account without a nickname (toPublicUser).
const FALLBACK_HANDLE_PATTERN = /^trader-?[0-9a-z]{6}$/i;

function reservedKey(nickname: string): string {
  return nickname.toLowerCase().replace(/[._-]/g, '').replace(/\d+$/, '');
}

export function isReservedNickname(nickname: string): boolean {
  const key = reservedKey(nickname);
  return (
    RESERVED_NICKNAMES.has(key) ||
    key.startsWith('neuralticker') ||
    FALLBACK_HANDLE_PATTERN.test(nickname)
  );
}

/**
 * Why `nickname` (already trimmed) cannot be chosen, or `null` when its form
 * is acceptable. Uniqueness is checked separately, against the database.
 */
export function nicknameProblem(nickname: string): string | null {
  if (
    nickname.length < NICKNAME_MIN_LENGTH ||
    nickname.length > NICKNAME_MAX_LENGTH
  ) {
    return `Nickname must be ${NICKNAME_MIN_LENGTH}-${NICKNAME_MAX_LENGTH} characters long.`;
  }
  if (!NICKNAME_PATTERN.test(nickname)) {
    return 'Nickname may contain only letters, digits, ".", "_" and "-", and must start and end with a letter or digit.';
  }
  if (isReservedNickname(nickname)) {
    return 'This nickname is reserved. Please choose another one.';
  }
  return null;
}
