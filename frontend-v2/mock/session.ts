// Session handling for the mock.
//
// Mirrors src/modules/auth/strategies/jwt.strategy.ts: the JWT travels in an
// HttpOnly cookie (or an Authorization: Bearer header), and
// `validate()` re-loads the user on every request — a deleted user is a 401,
// a `revoked` user is a 401 with its own message.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { appendCookie, parseCookies, unauthenticated, unauthorizedMsg } from './core.ts';
import type { MockState, User } from './state.ts';

// Not the real name on purpose. Cookies are shared by every port on
// `localhost`, so a mock that wrote `authentication` would overwrite (or clear)
// the session of a real backend open in the same browser and sign the user out.
export const AUTH_COOKIE = 'mock_authentication';
export const SCENARIO_COOKIE = 'mock_scenario';

/** The mock "JWT". Not signed — it only needs to round-trip a user id. */
export const tokenFor = (userId: string): string => `mock.${userId}`;

function readToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (auth && /^bearer /i.test(auth)) return auth.slice(7).trim();
  const cookie = parseCookies(req.headers.cookie)[AUTH_COOKIE];
  return cookie && cookie.length > 0 ? cookie : null;
}

/** Returns the signed-in user or throws the same 401 the real guard would. */
export function authenticate(state: MockState, req: IncomingMessage): User {
  const token = readToken(req);
  if (!token || !token.startsWith('mock.')) throw unauthenticated();
  const user = state.users.find((u) => u.id === token.slice(5));
  if (!user) throw unauthenticated();
  if (user.role === 'revoked') throw unauthorizedMsg('Account access has been revoked');
  return user;
}

/** Same cookie attributes as AuthController.devLogin / googleAuthRedirect. */
export function setAuthCookie(res: ServerResponse, userId: string): void {
  appendCookie(
    res,
    `${AUTH_COOKIE}=${encodeURIComponent(tokenFor(userId))}; Max-Age=86400; Path=/; HttpOnly; SameSite=Lax`,
  );
}

export function clearAuthCookie(res: ServerResponse): void {
  appendCookie(
    res,
    `${AUTH_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`,
  );
}
