import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { AllowedUser } from './entities/allowed-user.entity';
import { NicknameGeneratorService } from './nickname-generator.service';

const DEFAULT_ADMINS = ['branislavlang@gmail.com', 'juraj.hudak79@gmail.com'];

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

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
        user.nickname = this.nicknameGenerator.generate();
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
      tier: role === 'admin' || roleOverride === 'admin' ? 'pro' : 'free', // Admins get PRO tier
      nickname: this.nicknameGenerator.generate(),
      view_mode: 'PRO', // Default
      theme: 'dark', // Default
    });

    try {
      return await this.userRepo.save(newUser);
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

  async updateProfile(
    id: string,
    updates: {
      nickname?: string;
      view_mode?: string;
      theme?: string;
      has_onboarded?: boolean;
    },
  ): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (updates.nickname) user.nickname = updates.nickname;
    if (updates.view_mode) user.view_mode = updates.view_mode;
    if (updates.theme) user.theme = updates.theme;
    if (updates.has_onboarded !== undefined)
      user.has_onboarded = updates.has_onboarded;

    return this.userRepo.save(user);
  }

  async updateRole(id: string, role: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    user.role = role;
    // Auto-grant Pro tier if promoted to Admin
    if (role === 'admin') {
      user.tier = 'pro';
    }
    return this.userRepo.save(user);
  }

  async updateTier(id: string, tier: 'free' | 'pro'): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    user.tier = tier;
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

  async getProfile(id: string): Promise<User | null> {
    return this.userRepo.findOne({
      where: { id },
      relations: ['credit_transactions'],
      order: {
        credit_transactions: {
          created_at: 'DESC',
        },
      },
    });
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

  async findAll(): Promise<User[]> {
    return this.userRepo.find();
  }
}
