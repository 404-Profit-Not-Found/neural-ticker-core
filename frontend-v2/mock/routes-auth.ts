// Auth, users and admin endpoints.
import type { Router } from './core.ts';
import {
  HANDLED,
  badRequest,
  conflict,
  forbidden,
  iso,
  notFound,
  unauthorizedMsg,
  v,
  validate,
} from './core.ts';
import { clearAuthCookie, setAuthCookie, tokenFor } from './session.ts';
import type { MockState, User } from './state.ts';
import { nextId, userById } from './state.ts';
import { redactUser } from './views.ts';
import { rng, uuid } from './rng.ts';

/** UsersService.DEFAULT_ADMINS (src/modules/users/users.service.ts). */
const DEFAULT_ADMINS = ['branislavlang@gmail.com', 'juraj.hudak79@gmail.com'];

function nickname(seed: string): string {
  const r = rng('nick:' + seed);
  const adj = ['Swift', 'Quiet', 'Iron', 'Lucky', 'Bold', 'Calm', 'Wise', 'Rapid', 'Mellow', 'Noble'];
  const noun = ['Falcon', 'Otter', 'Badger', 'Heron', 'Lynx', 'Marmot', 'Raven', 'Gecko', 'Yak', 'Stoat'];
  return `${adj[Math.floor(r() * adj.length)]}${noun[Math.floor(r() * noun.length)]}${Math.floor(r() * 1000)}`;
}

/** UsersService.createOrUpdateGoogleUser, as driven by AuthService.localDevLogin.
 *  Mock rule on top: an email containing "admin" is created as an admin. */
export function devLoginUser(state: MockState, email: string): User {
  const isAdmin = DEFAULT_ADMINS.includes(email) || /admin/i.test(email);
  const now = iso(Date.now());
  let user = state.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (user) {
    user.google_id = `dev-${email}`;
    user.full_name = 'Dev User';
    user.avatar_url = '';
    user.last_login = now;
    if (!user.nickname) user.nickname = nickname(email);
    if (isAdmin) user.role = 'admin';
    if (user.role === 'admin' && user.tier === 'free') user.tier = 'pro';
    user.updated_at = now;
    return user;
  }
  user = {
    id: uuid('user:' + email),
    email,
    google_id: `dev-${email}`,
    full_name: 'Dev User',
    role: isAdmin ? 'admin' : 'user',
    tier: isAdmin ? 'pro' : 'free',
    credits_balance: 10,
    credits_reset_at: null,
    avatar_url: '',
    created_at: now,
    updated_at: now,
    last_login: now,
    preferences: null,
    nickname: nickname(email),
    view_mode: 'PRO',
    has_onboarded: false,
    theme: 'dark',
  };
  state.users.push(user);
  return user;
}

// ── nickname rules ─ src/modules/users/nickname.rules.ts ─────────────────
// Applied when a nickname is CHANGED (UsersService.updateProfile); a nickname
// that predates them keeps working until then.
const RESERVED_NICKNAMES = new Set([
  'admin', 'administrator', 'root', 'owner', 'system', 'support', 'help', 'helpdesk', 'moderator', 'mod',
  'staff', 'team', 'official', 'security', 'neuralticker', 'neuralticket', 'bot',
  'ai', 'anonymous', 'unknown', 'someone', 'trader', 'user', 'null', 'undefined',
]);

function nicknameProblem(nickname: string): string | null {
  if (nickname.length < 3 || nickname.length > 24) return 'Nickname must be 3-24 characters long.';
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(nickname)) {
    return 'Nickname may contain only letters, digits, ".", "_" and "-", and must start and end with a letter or digit.';
  }
  const key = nickname.toLowerCase().replace(/[._-]/g, '').replace(/\d+$/, '');
  if (RESERVED_NICKNAMES.has(key) || key.startsWith('neuralticker') || /^trader-?[0-9a-z]{6}$/i.test(nickname)) {
    return 'This nickname is reserved. Please choose another one.';
  }
  return null;
}

function requireUser(state: MockState, id: string): User {
  const u = userById(state, id);
  if (!u) throw notFound(`User with ID ${id} not found`);
  return u;
}

/** UsersService.updateRole — promoting to admin also grants the pro tier. */
function updateRole(state: MockState, id: string, role: string): User {
  const u = requireUser(state, id);
  u.role = role;
  if (role === 'admin') u.tier = 'pro';
  u.updated_at = iso(Date.now());
  return u;
}

function allowEmail(state: MockState, email: string, addedBy: string): unknown {
  const existing = state.allowed.find((a) => a.email === email);
  if (existing) return existing;
  const row = { id: uuid(`allowed:${email}:${Date.now()}`), email, added_by: addedBy, created_at: iso(Date.now()) };
  state.allowed.push(row);
  return row;
}

export function registerAuth(r: Router, opts: { frontendUrl: string }): void {
  // ── /api/auth ─ src/modules/auth/auth.controller.ts (@Public() class) ──

  // GET auth/google — the real route 302s to Google's consent screen and the
  // callback then sets the cookie and 302s to `${frontendUrl}/oauth-callback`
  // (or /access-denied?error=waitlist_joined for ?intent=waitlist). The mock
  // collapses the round trip: it signs the seeded user in and redirects.
  const google = (c: Parameters<Parameters<Router['get']>[2]>[0]): symbol => {
    let location = `${opts.frontendUrl}/oauth-callback`;
    if (c.query.get('intent') === 'waitlist') {
      location = `${opts.frontendUrl}/access-denied?error=waitlist_joined`;
    } else {
      setAuthCookie(c.res, c.state.ids.user);
    }
    c.res.statusCode = 302;
    c.res.setHeader('Location', location);
    c.res.end();
    return HANDLED;
  };
  r.get('/auth/google', { auth: 'public', noError: true }, google);
  r.get('/auth/google/callback', { auth: 'public', noError: true }, google);

  // GET auth/profile — @UseGuards(AuthGuard('jwt')); returns the caller's
  // account (full_name, credits_balance, avatar_url, … — there is no `name`
  // field) with secret preference values redacted, like every account route.
  r.get('/auth/profile', { auth: 'user', noError: true }, (c) => redactUser(c.user as User));

  // POST auth/firebase — FirebaseLoginDto { token }.
  r.post('/auth/firebase', { auth: 'public', noError: true }, (c) => {
    validate(c.body, ['token'], (o) => [v.isString(o, 'token'), v.isNotEmpty(o, 'token')]);
    throw unauthorizedMsg('Invalid Firebase Token: Firebase is not available in the mock');
  });

  // POST auth/dev/token — CreateUserTokenDto { email }; 201 with
  // AuthService.login()'s `{ access_token, user: { id, email, name, avatar, role } }`.
  // (The real route additionally requires ENABLE_DEV_LOGIN=true and non-prod.)
  r.post('/auth/dev/token', { auth: 'public', noError: true }, (c) => {
    const o = validate(c.body, ['email'], (b) => [v.isEmail(b, 'email'), v.isNotEmpty(b, 'email')]);
    const user = devLoginUser(c.state, o.email as string);
    setAuthCookie(c.res, user.id);
    return {
      access_token: tokenFor(user.id),
      user: { id: user.id, email: user.email, name: user.full_name, avatar: user.avatar_url, role: user.role },
    };
  });

  // POST auth/logout — explicit 200 `{ success: true }`, clears the cookie.
  r.post('/auth/logout', { auth: 'public', status: 200, noError: true }, (c) => {
    clearAuthCookie(c.res);
    return { success: true };
  });

  // ── /api/v1/users ─ src/modules/users/users.controller.ts ──────────────

  // GET v1/users — @Roles('admin'); UsersService.findAll (redacted prefs).
  r.get('/v1/users', { auth: 'admin', empty: () => [] }, (c) => c.state.users.map(redactUser));

  // GET v1/users/logins — @Roles('admin'); AuthLog rows, newest first.
  r.get('/v1/users/logins', { auth: 'admin', empty: () => [] }, (c) => {
    const limit = Number(c.query.get('limit')) || 100;
    return c.state.users
      .filter((u) => u.google_id)
      .map((u) => ({
        id: uuid('authlog:' + u.id),
        userId: u.id,
        provider: u.google_id?.startsWith('dev-') ? 'dev' : 'google',
        email: u.email,
        loginAt: u.last_login,
        ipAddress: null,
        userAgent: null,
      }))
      .sort((a, b) => b.loginAt.localeCompare(a.loginAt))
      .slice(Number(c.query.get('offset')) || 0)
      .slice(0, limit);
  });

  // GET v1/users/search?q= — UsersService.searchUsers: prefix match on the
  // NICKNAME only (never the email), active users only, max 10, public view.
  r.get('/v1/users/search', { auth: 'user', empty: () => [] }, (c) => {
    const q = (c.query.get('q') || '').toLowerCase();
    if (!q) return [];
    return c.state.users
      .filter((u) => ['user', 'admin'].includes(u.role) && u.nickname)
      .filter((u) => (u.nickname as string).toLowerCase().startsWith(q.slice(0, 50)))
      .sort((a, b) => (a.nickname as string).localeCompare(b.nickname as string))
      .slice(0, 10)
      .map((u) => ({ id: u.id, nickname: u.nickname, avatar_url: u.avatar_url, tier: u.tier }));
  });

  // GET v1/users/me — UsersService.getProfile: user + credit_transactions
  // (newest first), preferences redacted.
  r.get('/v1/users/me', { auth: 'user' }, (c) => {
    const me = c.user as User;
    return {
      ...redactUser(me),
      credit_transactions: c.state.creditTx
        .filter((t) => t.user_id === me.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    };
  });

  // PATCH v1/users/me — UpdateProfileDto { nickname?, view_mode?, theme?,
  // has_onboarded?, avatar_url? } (anything else is a 400; avatar_url is
  // accepted and ignored). A nickname that CHANGES must be 3–24 characters of
  // letters/digits/._- (alphanumeric at both ends), not reserved (400) and not
  // used by another account, ignoring case (409). Resending the current
  // nickname, or an empty one, changes nothing. Returns the saved account
  // (secret preference values redacted).
  r.patch('/v1/users/me', { auth: 'user' }, (c) => {
    const me = c.user as User;
    const b = validate(c.body, ['nickname', 'view_mode', 'theme', 'has_onboarded', 'avatar_url'], (o, has) => [
      ...(has('nickname') ? [v.isString(o, 'nickname'), v.maxLength(o, 'nickname', 100)] : []),
      ...(has('view_mode') ? [v.isIn(o, 'view_mode', ['KISS', 'PRO'])] : []),
      ...(has('theme') ? [v.isString(o, 'theme'), v.matches(o, 'theme', /^[A-Za-z0-9_-]{1,32}$/, 'theme must be a short theme identifier')] : []),
      ...(has('has_onboarded') ? [v.isBoolean(o, 'has_onboarded')] : []),
      ...(has('avatar_url') ? [v.isString(o, 'avatar_url'), v.maxLength(o, 'avatar_url', 2048)] : []),
    ]);
    if (typeof b.nickname === 'string' && b.nickname !== me.nickname) {
      const nickname = b.nickname.trim();
      if (nickname && nickname !== me.nickname) {
        const problem = nicknameProblem(nickname);
        if (problem) throw badRequest(problem);
        if (c.state.users.some((u) => u.id !== me.id && (u.nickname ?? '').toLowerCase() === nickname.toLowerCase())) {
          throw conflict('This nickname is already taken.');
        }
        me.nickname = nickname;
      }
    }
    if (b.view_mode) me.view_mode = b.view_mode as string;
    if (b.theme) me.theme = b.theme as string;
    if (b.has_onboarded !== undefined) me.has_onboarded = b.has_onboarded as boolean;
    me.updated_at = iso(Date.now());
    return redactUser(me);
  });

  // POST v1/users/me/preferences — UsersService.updatePreferences: whitelist
  // of keys, language must be en|sk. Returns the saved account; secret values
  // (even the key just submitted) come back as `<key>_set: true`.
  r.post('/v1/users/me/preferences', { auth: 'user' }, (c) => {
    const me = c.user as User;
    const prefs = c.body;
    if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) {
      throw badRequest('Invalid preferences payload');
    }
    const sanitized: Record<string, unknown> = {};
    for (const key of ['displayCurrency', 'notifications', 'gemini_api_key', 'language']) {
      if (Object.prototype.hasOwnProperty.call(prefs, key)) sanitized[key] = prefs[key];
    }
    if (sanitized.language !== undefined && !['en', 'sk'].includes(sanitized.language as string)) {
      throw badRequest('Unsupported language. Allowed: en, sk');
    }
    me.preferences = { ...(me.preferences ?? {}), ...sanitized };
    me.updated_at = iso(Date.now());
    return redactUser(me);
  });

  // PUT v1/users/:id/role — @Roles('admin'); 400 on a bad role.
  r.put('/v1/users/:id/role', { auth: 'admin' }, (c) => {
    const role = c.body?.role as string;
    if (!['user', 'admin'].includes(role)) {
      throw badRequest('Invalid role. Must be user or admin.');
    }
    return redactUser(updateRole(c.state, c.params.id as string, role));
  });

  // POST v1/users/:id/approve — @Roles('admin'); waitlist → user + invite list.
  r.post('/v1/users/:id/approve', { auth: 'admin' }, (c) => {
    const u = requireUser(c.state, c.params.id as string);
    u.role = 'user';
    u.updated_at = iso(Date.now());
    allowEmail(c.state, u.email, 'Admin Console');
    return redactUser(u);
  });

  // ── /api/v1/admin ─ src/modules/users/admin.controller.ts (@Roles('admin')) ──

  r.get('/v1/admin/users', { auth: 'admin', empty: () => [] }, (c) => c.state.users.map(redactUser));

  // GET v1/admin/userlist — allowed_users, newest first.
  r.get('/v1/admin/userlist', { auth: 'admin', empty: () => [] }, (c) =>
    [...c.state.allowed].sort((a, b) => b.created_at.localeCompare(a.created_at)),
  );

  // GET v1/admin/identities — UsersService.getUnifiedIdentities.
  r.get('/v1/admin/identities', { auth: 'admin', empty: () => [] }, (c) => {
    const map = new Map<string, Record<string, unknown>>();
    for (const a of c.state.allowed) {
      map.set(a.email, {
        email: a.email,
        status: 'INVITED',
        invited_at: a.created_at,
        invited_by: a.added_by,
        is_whitelisted: true,
      });
    }
    for (const u of c.state.users) {
      const existing = map.get(u.email) ?? {};
      let status = 'ACTIVE';
      if (u.role === 'admin') status = 'ADMIN';
      else if (u.role === 'waitlist') status = 'WAITLIST';
      else if (u.role === 'revoked') status = 'BANNED';
      map.set(u.email, {
        ...existing,
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        role: u.role,
        last_login: u.last_login,
        created_at: u.created_at,
        avatar_url: u.avatar_url,
        status,
        is_registered: true,
        tier: u.tier,
        credits_balance: u.credits_balance,
      });
    }
    const when = (x: Record<string, unknown>): number =>
      new Date((x.last_login || x.created_at || x.invited_at || 0) as string | number).getTime();
    return [...map.values()].sort((a, b) => when(b) - when(a));
  });

  // POST v1/admin/userlist — AddToUserlistDto { email, addedBy? }; 400 when
  // the email is missing or malformed.
  r.post('/v1/admin/userlist', { auth: 'admin' }, (c) => {
    const dto = validate(c.body, ['email', 'addedBy'], (o, has) => [
      v.isEmail(o, 'email'),
      ...(has('addedBy') ? [v.isString(o, 'addedBy'), v.maxLength(o, 'addedBy', 100)] : []),
    ]);
    return allowEmail(c.state, dto.email as string, (dto.addedBy as string) || 'admin');
  });

  // DELETE v1/admin/userlist/:email — UsersService.revokeEmail (soft ban).
  r.delete('/v1/admin/userlist/:email', { auth: 'admin' }, (c) => {
    const email = c.params.email as string;
    if ((c.user as User).email === email) throw forbidden('You cannot revoke your own access.');
    const target = c.state.users.find((u) => u.email === email);
    if (target && target.role === 'admin') {
      throw forbidden('Cannot revoke access of another administrator.');
    }
    c.state.allowed = c.state.allowed.filter((a) => a.email !== email);
    if (target) {
      target.role = 'revoked';
      target.updated_at = iso(Date.now());
    }
    return undefined;
  });

  // PATCH v1/admin/users/:id/role { role } — admin | user | waitlist.
  r.patch('/v1/admin/users/:id/role', { auth: 'admin' }, (c) => {
    const valid = ['admin', 'user', 'waitlist'];
    if (!valid.includes(c.body?.role as string)) {
      throw badRequest(`Invalid role. Must be one of: ${valid.join(', ')}`);
    }
    return redactUser(updateRole(c.state, c.params.id as string, c.body.role as string));
  });

  // DELETE v1/admin/waitlist/:email — UsersService.deleteWaitlistUser.
  r.delete('/v1/admin/waitlist/:email', { auth: 'admin' }, (c) => {
    const email = c.params.email as string;
    const target = c.state.users.find((u) => u.email === email);
    if (!target) throw notFound(`User with email ${email} not found`);
    if (target.role !== 'waitlist') {
      throw forbidden('Only waitlist users can be rejected/deleted via this method.');
    }
    c.state.users = c.state.users.filter((u) => u.id !== target.id);
    return undefined;
  });

  // PATCH v1/admin/users/:id/tier — UpdateUserTierDto { tier: free|pro|whale }.
  r.patch('/v1/admin/users/:id/tier', { auth: 'admin' }, (c) => {
    const dto = validate(c.body, ['tier'], (o) => [v.isIn(o, 'tier', ['free', 'pro', 'whale'])]);
    const u = requireUser(c.state, c.params.id as string);
    u.tier = dto.tier as User['tier'];
    u.updated_at = iso(Date.now());
    return redactUser(u);
  });

  // POST v1/admin/users/:id/credits { amount, reason? } — CreditService.addCredits;
  // the admin gets the account back (secret preference values redacted).
  // GiftCreditsDto { amount: integer 1..100000, reason?: note ≤ 200 chars }.
  // The ledger reason is ALWAYS 'admin_gift'; the body's reason is kept as
  // `metadata.note`.
  r.post('/v1/admin/users/:id/credits', { auth: 'admin' }, (c) => {
    const dto = validate(c.body, ['amount', 'reason'], (o, has) => [
      v.isInt(o, 'amount'),
      v.min(o, 'amount', 1),
      v.max(o, 'amount', 100_000),
      ...(has('reason') ? [v.isString(o, 'reason'), v.maxLength(o, 'reason', 200)] : []),
    ]);
    const amount = dto.amount as number;
    const u = userById(c.state, c.params.id as string);
    if (!u) throw badRequest('User not found');
    u.credits_balance += amount;
    u.updated_at = iso(Date.now());
    c.state.creditTx.push({
      id: Number(nextId(c.state, 'credit_transactions')),
      user_id: u.id,
      amount,
      reason: 'admin_gift',
      metadata: dto.reason ? { gifted_by: 'admin', note: dto.reason } : { gifted_by: 'admin' },
      created_at: iso(Date.now()),
    });
    return redactUser(u);
  });

  // DELETE v1/admin/users/:id/reset-tutorial — wipes watchlists, positions
  // and the personalised digest.
  r.delete('/v1/admin/users/:id/reset-tutorial', { auth: 'admin' }, (c) => {
    const id = c.params.id as string;
    const lists = new Set(c.state.watchlists.filter((w) => w.user_id === id).map((w) => w.id));
    c.state.watchlistItems = c.state.watchlistItems.filter((i) => !lists.has(i.watchlist_id));
    c.state.watchlists = c.state.watchlists.filter((w) => w.user_id !== id);
    c.state.positions = c.state.positions.filter((p) => p.user_id !== id);
    c.state.notes = c.state.notes.filter(
      (n) => !(n.user_id === id && (n.title ?? '').startsWith('Smart News Briefing')),
    );
    return { message: 'Tutorial state reset successfully' };
  });
}
