import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { AllowedUser } from './entities/allowed-user.entity';
import { NicknameGeneratorService } from './nickname-generator.service';

const DEFAULT_ADMINS = ['branislavlang@gmail.com', 'juraj.hudak79@gmail.com'];

@Injectable()
export class UsersService {
  constructor(
    private readonly nicknameGenerator: NicknameGeneratorService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AllowedUser)
    private readonly allowedUserRepo: Repository<AllowedUser>,
  ) {}

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

    // 2. If user exists, ban/delete/reset role?
    // For now, let's just ensure they can't login by maybe changing role to 'banned' or just relying on "not in whitelist"
    // The google strategy checks whitelist. So removing from whitelist is enough for NEW logins.
    // But existing sessions?
    // If we want to kill active session, we might need to increment a 'tokenVersion' or similar.
    // For now, strict requirement is "delete".

    // If user exists, we SHOULD probably remove them or set to a non-active role to be sure.
    if (user) {
      // user.role = 'user'; // Already user?
      // user.role = 'banned'?
      // Actually, the request implies 'delete' or 'revoke'.
      // Existing logic was just removing from allow list?
      // Let's check what it was doing before.
      // It seems it was just `this.allowedUserRepo.delete({ email })`.
      // But if `validateOAuthLogin` checks `isEmailAllowed`, then removing from valid list is sufficient for next login.
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
      user = await this.findByEmail(profile.email);
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
        user.nickname = this.nicknameGenerator.generate();
      }
      if (role) user.role = role; // Enforce admin if email matches
      // If roleOverride is provided (e.g. waitlist), and user is NOT an admin/user (maybe they are trying to join waitlist but already exist?),
      // Actually if they exist they shouldn't trigger waitlist logic unless they were previously deleted or something?
      // If they exist and are 'user', they can just login.
      // If they exist and are 'waitlist' already, fine.
      // If they exist and are 'user', and try to join waitlist, we shouldn't downgrade them.
      // So only apply roleOverride if creating?
      // UsersService logic: If user exists, we usually return them.

      return this.userRepo.save(user);
    }

    // Create new
    const newUser = this.userRepo.create({
      email: profile.email,
      google_id: profile.googleId,
      full_name: profile.fullName,
      avatar_url: profile.avatarUrl,
      last_login: new Date(),
      role: role || roleOverride || 'user',
      nickname: this.nicknameGenerator.generate(),
      view_mode: 'PRO', // Default
      theme: 'dark', // Default
    });

    return this.userRepo.save(newUser);
  }

  async updateProfile(
    id: string,
    updates: { nickname?: string; view_mode?: string; theme?: string },
  ): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (updates.nickname) user.nickname = updates.nickname;
    if (updates.view_mode) user.view_mode = updates.view_mode;
    if (updates.theme) user.theme = updates.theme;

    return this.userRepo.save(user);
  }

  async updateRole(id: string, role: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    user.role = role;
    return this.userRepo.save(user);
  }

  async updatePreferences(
    id: string,
    preferences: Record<string, any>,
  ): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    user.preferences = { ...user.preferences, ...preferences };
    return this.userRepo.save(user);
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async approveUser(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // 1. Update role to 'user'
    user.role = 'user';
    await this.userRepo.save(user);

    // 2. Add to Whitelist
    await this.allowEmail(user.email, 'Admin Console');

    return user;
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
      else if (existing.is_whitelisted) status = 'ACTIVE'; // If whitelisted and registered, they are active

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

  async findAll(): Promise<User[]> {
    return this.userRepo.find();
  }
}
