import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

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
    });

    return this.userRepo.save(newUser);
  }

  async updateRole(id: string, role: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new Error('User not found');
    user.role = role;
    return this.userRepo.save(user);
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findAll(): Promise<User[]> {
    return this.userRepo.find();
  }
}
