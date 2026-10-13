import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { AllowedUser } from './entities/allowed-user.entity';
import { NicknameGeneratorService } from './nickname-generator.service';
import { nicknameProblem } from './nickname.rules';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SecretBox } from './secret-box.service';
import {
  AccountUser,
  PublicUser,
  toAccountUser,
  toPublicUser,
  userColumns,
} from './public-user';

const DEFAULT_ADMINS = ['branislavlang@gmail.com', 'juraj.hudak79@gmail.com'];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class UsersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly nicknameGenerator: NicknameGeneratorService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AllowedUser)
    private readonly allowedUserRepo: Repository<AllowedUser>,
    private readonly secretBox: SecretBox,
  ) {}

  /**
   * Personal API keys at rest. With USER_SECRETS_KEYS configured, keys still
   * stored in clear text are moved into the encrypted column before the
   * application starts serving; without it, one warning and nothing changes.
   * Neither may stop the application from starting.
   */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.secretBox.enabled) {
      this.logger.warn(
        'USER_SECRETS_KEYS is not set: personal API keys of users are stored ' +
          'UNENCRYPTED in the database (users.preferences), as before. Set it ' +
          'to encrypt them at rest — see .env.example.',
      );
      return;
    }
    try {
      const moved = await this.backfillLlmKeys();
      const rotated = await this.reencryptLlmKeys();
      this.logger.log(
        `Personal API keys at rest: ${moved.encrypted} encrypted now, ` +
          `${moved.cleared} empty value(s) removed, ${moved.skipped} skipped; ` +
          `${rotated.reencrypted} re-encrypted with the active key, ` +
          `${rotated.undecryptable} could not be decrypted.`,
      );
    } catch (error) {
      this.logger.error(
        `Encrypting stored personal API keys failed; they stay as they were ` +
          `and will be retried at the next start: ${(error as Error)?.message}`,
      );
    }
  }

  async isEmailAllowed(email: string): Promise<boolean> {
    if (DEFAULT_ADMINS.includes(email)) return true; // Super Admin always allowed
    const count = await this.allowedUserRepo.count({ where: { email } });
    return count > 0;
  }

  async allowEmail(email: string, addedBy: string): Promise<AllowedUser> {
    const existing = await this.allowedUserRepo.findOne({ where: { email } });
    if (existing) return existing;

    const allowed = this.allowedUserRepo.create({
      email,
      added_by: addedBy,
    });
    return this.allowedUserRepo.save(allowed);
  }

  async deleteWaitlistUser(email: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { email } });

    if (!user) {
      throw new NotFoundException(`User with email ${email} not found`);
    }

    if (user.role !== 'waitlist') {
      throw new ForbiddenException(
        'Only waitlist users can be rejected/deleted via this method.',
      );
    }

    await this.userRepo.delete({ id: user.id });
  }

  async revokeEmail(email: string, requester?: User): Promise<void> {
    // Safety Checks
    if (requester) {
      if (requester.email === email) {
        throw new ForbiddenException('You cannot revoke your own access.');
      }
    }

    const user = await this.userRepo.findOne({ where: { email } });

    // Check if target is admin
    if (user && user.role === 'admin') {
      throw new ForbiddenException(
        'Cannot revoke access of another administrator.',
      );
    }

    // 1. Remove from allow list
    await this.allowedUserRepo.delete({ email });

    // 2. Soft delete: Set role to 'revoked' so they cannot login but data is preserved
    if (user) {
      this.logger.log(`Revoking access for user: ${email}`);
      user.role = 'revoked';
      await this.userRepo.save(user);
    }
  }

  async getAllowedUsers(): Promise<AllowedUser[]> {
    return this.allowedUserRepo.find({ order: { created_at: 'DESC' } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email } });
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { google_id: googleId } });
  }

  /**
   * PRECONDITION — the caller has already established that `profile.email` is
   * VERIFIED by the identity provider and has applied the access policy
   * (invite list / waitlist). This method trusts the email completely: it
   * links the login to an existing account with that address and promotes the
   * default admins. Never call it with an address the provider has not
   * verified (see AuthService.validateOAuthLogin / loginWithFirebase).
   */
  async createOrUpdateGoogleUser(
    profile: {
      email: string;
      googleId: string;
      fullName: string;
      avatarUrl: string;
    },
    roleOverride?: string,
  ): Promise<User> {
    let user = await this.findByGoogleId(profile.googleId);

    // Also check by email to merge accounts if needed (optional security choice)
    // For now, if googleId not found but email exists, we link them.
    if (!user) {
      // Use case-insensitive lookup to avoid duplicates
      user = await this.userRepo
        .createQueryBuilder('user')
        .where('LOWER(user.email) = LOWER(:email)', { email: profile.email })
        .getOne();
    }

    // Auto-Admin Logic
    const role = DEFAULT_ADMINS.includes(profile.email) ? 'admin' : undefined; // Only set on creation/update if matches

    if (user) {
      // Update info
      user.google_id = profile.googleId;
      user.full_name = profile.fullName;
      user.avatar_url = profile.avatarUrl;
      user.last_login = new Date();
      // Ensure existing users get a nickname if they don't have one
      if (!user.nickname) {
        user.nickname = await this.generateAvailableNickname();
      }
      if (role) user.role = role; // Enforce admin if email matches

      // FIX: Ensure Admins have 'pro' tier benefits by default (KISS)
      if (user.role === 'admin' && user.tier === 'free') {
        user.tier = 'pro';
      }

      // SELF-HEAL: Fix legacy 'admin' tier in DB
      if ((user.tier as string) === 'admin') {
        user.tier = 'pro';
      }

      return this.saveWithGeneratedNickname(user);
    }

    // Create new
    const newUser = this.userRepo.create({
      email: profile.email,
      google_id: profile.googleId,
      full_name: profile.fullName,
      avatar_url: profile.avatarUrl,
      last_login: new Date(),
      role: role || roleOverride || 'user',
      tier: role === 'admin' || roleOverride === 'admin' ? 'pro' : 'free', // Admins get PRO tier
      nickname: await this.generateAvailableNickname(),
      view_mode: 'PRO', // Default
      theme: 'dark', // Default
    });

    try {
      return await this.saveWithGeneratedNickname(newUser);
    } catch (error) {
      // Handle Unique Constraint Violation (Race condition or missed lookup)
      if (error.code === '23505') {
        this.logger.warn(
          `Duplicate user detected on create: ${profile.email}. Recovering...`,
        );
        // Try to fetch one last time (the race winner)
        const existing = await this.userRepo
          .createQueryBuilder('user')
          .where('LOWER(user.email) = LOWER(:email)', { email: profile.email })
          .getOne();

        if (existing) {
          existing.google_id = profile.googleId;
          existing.last_login = new Date();
          return this.userRepo.save(existing);
        }
      }
      throw error;
    }
  }

  /** The unique index on LOWER(nickname) — see AddUserNicknameUniqueIndex. */
  static readonly NICKNAME_UNIQUE_INDEX = 'uq_users_nickname_lower';

  private static isNicknameConflict(error: any): boolean {
    return (
      error?.code === '23505' &&
      (error?.constraint ?? error?.driverError?.constraint) ===
        UsersService.NICKNAME_UNIQUE_INDEX
    );
  }

  private async isNicknameTaken(nickname: string): Promise<boolean> {
    const taken = await this.userRepo
      .createQueryBuilder('user')
      .where('LOWER(user.nickname) = LOWER(:nickname)', { nickname })
      .getCount();
    return taken > 0;
  }

  /**
   * A generated nickname that nobody has (compared case-insensitively).
   * The generator has about 400,000 combinations, so with a few hundred users
   * a fresh pick does collide now and then; with the unique index on
   * LOWER(nickname) that would otherwise fail the sign-up.
   */
  private async generateAvailableNickname(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = this.nicknameGenerator.generate();
      if (!(await this.isNicknameTaken(candidate))) return candidate;
    }
    return this.nicknameWithSuffix();
  }

  /** A generated nickname made unique with a random suffix. */
  private nicknameWithSuffix(): string {
    return `${this.nicknameGenerator.generate()}${randomBytes(3).toString('hex')}`;
  }

  /**
   * Saves a user whose nickname was just generated. If another sign-up took
   * the same nickname between the availability check and this insert (the
   * unique index says so), it gets a suffixed one instead of failing.
   */
  private async saveWithGeneratedNickname(user: User): Promise<User> {
    try {
      return await this.userRepo.save(user);
    } catch (error) {
      if (!UsersService.isNicknameConflict(error)) throw error;
      user.nickname = this.nicknameWithSuffix();
      return this.userRepo.save(user);
    }
  }

  /**
   * Validates a nickname the user is CHANGING to and returns it trimmed.
   * 400 when its form is not acceptable or it is reserved, 409 when another
   * account already uses it (compared case-insensitively).
   */
  private async assertNicknameAvailable(
    userId: string,
    nickname: string,
  ): Promise<void> {
    const problem = nicknameProblem(nickname);
    if (problem) {
      throw new BadRequestException(problem);
    }

    const taken = await this.userRepo
      .createQueryBuilder('user')
      .where('LOWER(user.nickname) = LOWER(:nickname)', { nickname })
      .andWhere('user.id != :userId', { userId })
      .getCount();
    if (taken > 0) {
      throw new ConflictException('This nickname is already taken.');
    }
  }

  async updateProfile(
    id: string,
    updates: Pick<
      UpdateProfileDto,
      'nickname' | 'view_mode' | 'theme' | 'has_onboarded'
    >,
  ): Promise<AccountUser> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // The nickname rules apply when it CHANGES. The clients resend the current
    // nickname with every theme save, and one that predates the rules (or is
    // empty for an account without a nickname) must keep being accepted.
    if (
      typeof updates.nickname === 'string' &&
      updates.nickname !== user.nickname
    ) {
      const nickname = updates.nickname.trim();
      if (nickname && nickname !== user.nickname) {
        await this.assertNicknameAvailable(id, nickname);
        user.nickname = nickname;
      }
    }
    if (updates.view_mode) user.view_mode = updates.view_mode;
    if (updates.theme) user.theme = updates.theme;
    if (updates.has_onboarded !== undefined)
      user.has_onboarded = updates.has_onboarded;

    try {
      return toAccountUser(await this.userRepo.save(user));
    } catch (error) {
      // Someone took the nickname between the check above and this save.
      if (UsersService.isNicknameConflict(error)) {
        throw new ConflictException('This nickname is already taken.');
      }
      throw error;
    }
  }

  async updateRole(id: string, role: string): Promise<AccountUser> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    user.role = role;
    // Auto-grant Pro tier if promoted to Admin
    if (role === 'admin') {
      user.tier = 'pro';
    }
    return toAccountUser(await this.userRepo.save(user));
  }

  async updateTier(
    id: string,
    tier: 'free' | 'pro' | 'whale',
  ): Promise<AccountUser> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    user.tier = tier;
    return toAccountUser(await this.userRepo.save(user));
  }

  // Only these top-level preference keys may be written by the client. Prevents
  // mass-assignment of arbitrary keys / large blobs into the JSON column.
  private static readonly ALLOWED_PREFERENCE_KEYS = [
    'displayCurrency',
    'notifications',
    'gemini_api_key',
    'language',
  ];

  // Supported UI languages. Must mirror the frontend i18n catalog
  // (frontend/src/i18n). Used to reject bogus language codes before they land
  // in the preferences JSON.
  private static readonly SUPPORTED_LANGUAGES = ['en', 'sk'];

  async updatePreferences(
    id: string,
    preferences: Record<string, any>,
  ): Promise<AccountUser> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (
      !preferences ||
      typeof preferences !== 'object' ||
      Array.isArray(preferences)
    ) {
      throw new BadRequestException('Invalid preferences payload');
    }

    // Whitelist: silently ignore unknown keys so a client cannot inject
    // arbitrary fields into the preferences JSON.
    const sanitized: Record<string, any> = {};
    for (const key of UsersService.ALLOWED_PREFERENCE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(preferences, key)) {
        sanitized[key] = preferences[key];
      }
    }

    if (
      sanitized.language !== undefined &&
      !UsersService.SUPPORTED_LANGUAGES.includes(sanitized.language)
    ) {
      throw new BadRequestException(
        `Unsupported language. Allowed: ${UsersService.SUPPORTED_LANGUAGES.join(', ')}`,
      );
    }

    const hasLlmKey = Object.prototype.hasOwnProperty.call(
      sanitized,
      'gemini_api_key',
    );
    const llmKey = sanitized.gemini_api_key;
    if (
      hasLlmKey &&
      llmKey !== null &&
      (typeof llmKey !== 'string' ||
        llmKey.length > UsersService.MAX_LLM_KEY_LENGTH)
    ) {
      throw new BadRequestException(
        `gemini_api_key must be a string of at most ${UsersService.MAX_LLM_KEY_LENGTH} characters`,
      );
    }

    user.preferences = { ...user.preferences, ...sanitized };
    if (hasLlmKey) this.storeLlmKey(user, llmKey);
    return toAccountUser(await this.userRepo.save(user));
  }

  static readonly MAX_LLM_KEY_LENGTH = 512;

  /**
   * Puts a new personal API key (or its removal) onto the user row.
   *
   * Encryption configured: the key goes into `gemini_api_key_enc` as
   * ciphertext bound to this user, and the clear text leaves `preferences`.
   * Not configured: `preferences.gemini_api_key` holds it, exactly as before —
   * and an encrypted value left over from a time when keys WERE configured is
   * dropped, so a key the user has replaced or removed cannot come back when
   * encryption is switched on again.
   */
  private storeLlmKey(user: User, key: string | null): void {
    if (!this.secretBox.enabled) {
      user.gemini_api_key_enc = null;
      return;
    }
    const preferences = { ...user.preferences };
    delete preferences.gemini_api_key;
    user.preferences = preferences;
    user.gemini_api_key_enc = key ? this.secretBox.encrypt(key, user.id) : null;
  }

  /**
   * THE reader of a user's personal LLM key — nothing else may touch
   * `gemini_api_key_enc` or `preferences.gemini_api_key`.
   *
   * Returns the key, or null for "no personal key": none stored, or the stored
   * one cannot be decrypted (the encryption key was lost or is not deployed;
   * the row was tampered with). In that case a warning names the user id —
   * never the value — and the caller falls back to the system key. It never
   * throws: a problem with one user's key must not fail their request.
   */
  async getUserLlmKey(userId: string): Promise<string | null> {
    try {
      const user = await this.userRepo.findOne({
        where: { id: userId },
        select: ['id', 'preferences', 'gemini_api_key_enc'],
      });
      if (!user) return null;

      const plaintext = user.preferences?.gemini_api_key;
      const stored =
        typeof plaintext === 'string' && plaintext ? plaintext : null;

      if (!user.gemini_api_key_enc) return stored;
      if (!this.secretBox.enabled) {
        // An encrypted key exists but no key to open it is configured.
        if (stored) return stored;
        this.logger.warn(
          `Personal API key of user ${userId} is encrypted but USER_SECRETS_KEYS is not set; using the system key.`,
        );
        return null;
      }
      try {
        return this.secretBox.decrypt(user.gemini_api_key_enc, user.id) || null;
      } catch {
        this.logger.warn(
          `Personal API key of user ${userId} could not be decrypted; using the system key.`,
        );
        return null;
      }
    } catch (error) {
      this.logger.warn(
        `Personal API key of user ${userId} could not be read (${(error as Error)?.name}); using the system key.`,
      );
      return null;
    }
  }

  /**
   * Moves personal API keys that are still in clear text
   * (`preferences.gemini_api_key`) into the encrypted column and removes the
   * clear text. Requires encryption to be configured.
   *
   * Idempotent and safe to run on several instances at once: each row is
   * updated only if its clear-text value is still the one that was read, so a
   * second run (or a concurrent one) finds nothing left to do. Works in
   * batches by id. Logs and returns counts only.
   */
  async backfillLlmKeys(
    batchSize = 200,
  ): Promise<{ encrypted: number; cleared: number; skipped: number }> {
    const result = { encrypted: 0, cleared: 0, skipped: 0 };
    if (!this.secretBox.enabled) return result;

    let lastId = '00000000-0000-0000-0000-000000000000';
    for (;;) {
      const rows: { id: string; kind: string; value: string | null }[] =
        await this.userRepo.query(
          `SELECT id,
                  jsonb_typeof(preferences -> 'gemini_api_key') AS kind,
                  preferences ->> 'gemini_api_key' AS value
             FROM users
            WHERE jsonb_exists(preferences, 'gemini_api_key') AND id > $1
            ORDER BY id
            LIMIT $2`,
          [lastId, batchSize],
        );
      if (rows.length === 0) break;
      lastId = rows[rows.length - 1].id;

      for (const row of rows) {
        if (row.kind === 'string' && row.value) {
          const updated = await this.userRepo.query(
            `UPDATE users
                SET gemini_api_key_enc = $1,
                    preferences = preferences - 'gemini_api_key'
              WHERE id = $2 AND preferences ->> 'gemini_api_key' = $3
            RETURNING id`,
            [this.secretBox.encrypt(row.value, row.id), row.id, row.value],
          );
          if (UsersService.affected(updated) > 0) result.encrypted++;
          else result.skipped++;
        } else if (
          row.kind === 'null' ||
          (row.kind === 'string' && !row.value)
        ) {
          // "" / null = the user removed their key: nothing to encrypt.
          const updated = await this.userRepo.query(
            `UPDATE users SET preferences = preferences - 'gemini_api_key'
              WHERE id = $1
                AND coalesce(preferences ->> 'gemini_api_key', '') = ''
            RETURNING id`,
            [row.id],
          );
          if (UsersService.affected(updated) > 0) result.cleared++;
          else result.skipped++;
        } else {
          // Not a string (never a usable key): left alone.
          result.skipped++;
        }
      }
    }
    return result;
  }

  /**
   * Key rotation: re-encrypts, with the ACTIVE key (the first one in
   * USER_SECRETS_KEYS), every stored key that was encrypted with an older one.
   * Once a start has reported `0 could not be decrypted` and nothing is left
   * under the old id, that old key can be removed from the variable.
   *
   * A value whose key is no longer configured cannot be decrypted; it is left
   * exactly as it is (and counted), never overwritten or deleted. Idempotent
   * and safe on several instances at once, like the backfill.
   */
  async reencryptLlmKeys(
    batchSize = 200,
  ): Promise<{ reencrypted: number; undecryptable: number }> {
    const result = { reencrypted: 0, undecryptable: 0 };
    if (!this.secretBox.enabled) return result;
    const activePrefix = `v1:${this.secretBox.activeKeyId}:`;

    let lastId = '00000000-0000-0000-0000-000000000000';
    for (;;) {
      const rows: { id: string; token: string }[] = await this.userRepo.query(
        `SELECT id, gemini_api_key_enc AS token
           FROM users
          WHERE gemini_api_key_enc IS NOT NULL
            AND NOT starts_with(gemini_api_key_enc, $1)
            AND id > $2
          ORDER BY id
          LIMIT $3`,
        [activePrefix, lastId, batchSize],
      );
      if (rows.length === 0) break;
      lastId = rows[rows.length - 1].id;

      for (const row of rows) {
        let plaintext: string;
        try {
          plaintext = this.secretBox.decrypt(row.token, row.id);
        } catch {
          result.undecryptable++;
          continue;
        }
        const updated = await this.userRepo.query(
          `UPDATE users SET gemini_api_key_enc = $1
            WHERE id = $2 AND gemini_api_key_enc = $3
          RETURNING id`,
          [this.secretBox.encrypt(plaintext, row.id), row.id, row.token],
        );
        if (UsersService.affected(updated) > 0) result.reencrypted++;
      }
    }
    return result;
  }

  /** Rows an `UPDATE … RETURNING` reported (pg: `[rows, count]` or rows). */
  private static affected(result: unknown): number {
    if (!Array.isArray(result)) return 0;
    return Array.isArray(result[0]) ? result[0].length : result.length;
  }

  /**
   * Loads the full row for SERVER-SIDE use (auth, ownership checks, the
   * research pipeline reading the user's own API key). Never return the result
   * to a client: use toAccountUser() for the owner/an admin and toPublicUser()
   * for anyone else.
   */
  async findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  /**
   * Get notification channel preferences for a user, with defaults.
   */
  async getNotificationPreferences(
    userId: string,
  ): Promise<{ push_enabled: boolean; email_enabled: boolean }> {
    const user = await this.findById(userId);
    const prefs = user?.preferences?.notifications;
    return {
      push_enabled: prefs?.push_enabled ?? true,
      email_enabled: prefs?.email_enabled ?? false,
    };
  }

  async getProfile(id: string): Promise<AccountUser | null> {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: ['credit_transactions'],
      order: {
        credit_transactions: {
          created_at: 'DESC',
        },
      },
    });
    return toAccountUser(user);
  }

  async approveUser(id: string): Promise<AccountUser> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // 1. Update role to 'user'
    user.role = 'user';
    await this.userRepo.save(user);

    // 2. Add to Whitelist
    await this.allowEmail(user.email, 'Admin Console');

    return toAccountUser(user);
  }

  async getUnifiedIdentities(): Promise<any[]> {
    const users = await this.userRepo.find();
    const allowed = await this.allowedUserRepo.find();

    const identityMap = new Map<string, any>();

    // 1. Process Allowed Users (Invite List)
    for (const a of allowed) {
      identityMap.set(a.email, {
        email: a.email,
        status: 'INVITED', // Default, might be overridden if they are active
        invited_at: a.created_at,
        invited_by: a.added_by,
        is_whitelisted: true,
      });
    }

    // 2. Process Registered Users (Active or Waitlist)
    for (const u of users) {
      const existing = identityMap.get(u.email) || {};

      let status = 'ACTIVE';
      if (u.role === 'admin') status = 'ADMIN';
      else if (u.role === 'waitlist') status = 'WAITLIST';
      else if (u.role === 'revoked') status = 'BANNED';
      else if (existing.is_whitelisted) status = 'ACTIVE';

      identityMap.set(u.email, {
        ...existing, // Keep invited info if exists
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        role: u.role,
        last_login: u.last_login,
        created_at: u.created_at,
        avatar_url: u.avatar_url,
        status: status,
        is_registered: true,
        // FIX: Handle legacy 'admin' tier in DB by forcing it to 'pro' for API clients
        tier: (u.tier as string) === 'admin' ? 'pro' : u.tier,
        credits_balance: u.credits_balance,
      });
    }

    // Convert map to array and sort by most recent activity/creation
    return Array.from(identityMap.values()).sort((a, b) => {
      const dateA = new Date(
        a.last_login || a.created_at || a.invited_at || 0,
      ).getTime();
      const dateB = new Date(
        b.last_login || b.created_at || b.invited_at || 0,
      ).getTime();
      return dateB - dateA;
    });
  }

  async findAll(): Promise<AccountUser[]> {
    const users = await this.userRepo.find();
    // Even admins should not receive other users' raw API keys.
    return users.map((u) => toAccountUser(u));
  }

  /**
   * Search users by nickname prefix for @mention autocomplete.
   *
   * Nickname ONLY: matching on the email as well turned this into an oracle —
   * any signed-in user could recover another user's address one character at a
   * time (each prefix that still returns the row is a correct guess) and tie it
   * to their nickname.
   */
  async searchUsers(
    query: string,
    limit: number = 10,
  ): Promise<Pick<User, 'id' | 'nickname' | 'avatar_url' | 'tier'>[]> {
    if (typeof query !== 'string' || query.length < 1) return [];

    const sanitized = query
      .slice(0, 50)
      .replace(/\\/g, '\\\\')
      .replace(/[%_]/g, '\\$&');

    return this.userRepo
      .createQueryBuilder('user')
      .select(userColumns('user'))
      .where('user.role IN (:...roles)', { roles: ['user', 'admin'] })
      .andWhere('user.nickname IS NOT NULL')
      .andWhere("user.nickname ILIKE :q ESCAPE '\\'", {
        q: `${sanitized}%`,
      })
      .orderBy('user.nickname', 'ASC')
      .take(limit)
      .getMany();
  }

  /**
   * Public view of the given users (batch lookup for comment authors and
   * mention resolution). Loads the public columns only.
   */
  async findPublicByIds(ids: string[]): Promise<PublicUser[]> {
    // Ids also come from user-written `<@id>` mention tokens. One that is not
    // a UUID cannot match a user — and would make Postgres reject the query.
    const uuids = ids.filter((id) => UUID_PATTERN.test(id));
    if (!uuids.length) return [];
    const users = await this.userRepo
      .createQueryBuilder('user')
      .select(userColumns('user'))
      .where('user.id IN (:...ids)', { ids: uuids })
      .getMany();
    return users.map((u) => toPublicUser(u) as PublicUser);
  }
}
