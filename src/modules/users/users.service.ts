import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { AllowedUser } from './entities/allowed-user.entity';
import { NicknameGeneratorService } from './nickname-generator.service';

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
    if (email === 'branislavlang@gmail.com') return true; // Super Admin always allowed
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

  async revokeEmail(email: string): Promise<void> {
    await this.allowedUserRepo.delete({ email });
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

  async createOrUpdateGoogleUser(profile: {
    email: string;
    googleId: string;
    fullName: string;
    avatarUrl: string;
  }): Promise<User> {
    let user = await this.findByGoogleId(profile.googleId);

    // Also check by email to merge accounts if needed (optional security choice)
    // For now, if googleId not found but email exists, we link them.
    if (!user) {
      user = await this.findByEmail(profile.email);
    }

    // Auto-Admin Logic
    const role =
      profile.email === 'branislavlang@gmail.com' ? 'admin' : undefined; // Only set on creation/update if matches

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
      return this.userRepo.save(user);
    }

    // Create new
    const newUser = this.userRepo.create({
      email: profile.email,
      google_id: profile.googleId,
      full_name: profile.fullName,
      avatar_url: profile.avatarUrl,
      last_login: new Date(),
      role: role || 'user',
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

  async findAll(): Promise<User[]> {
    return this.userRepo.find();
  }
}
