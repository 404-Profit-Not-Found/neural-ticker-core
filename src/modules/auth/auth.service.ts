import {
  Injectable,
  UnauthorizedException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { FirebaseService } from '../firebase/firebase.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthLog } from './entities/auth-log.entity';
import { AuthLogFilterDto } from './dto/auth-log-filter.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly firebaseService: FirebaseService,
    @InjectRepository(AuthLog)
    private readonly authLogRepo: Repository<AuthLog>,
  ) {}

  async validateOAuthLogin(profile: any, intent?: string): Promise<any> {
    // profile from passport-google-oauth20
    const { id, displayName, emails, photos } = profile;
    const email = emails[0].value;
    const avatarUrl = photos ? photos[0]?.value : '';

    // Access Control: Check Whitelist
    const isAllowed = await this.usersService.isEmailAllowed(email);

    // Logic: If not allowed...
    // Logic: If not allowed...
    if (!isAllowed) {
      // Check if user is requesting to join the waitlist
      if (intent === 'waitlist') {
        this.logger.log(`User joining waitlist: ${email}`);
        // Proceed to create/update but force ROLE = 'waitlist' if new or update status
        const user = await this.usersService.createOrUpdateGoogleUser(
          {
            googleId: id,
            email: email,
            fullName: displayName,
            avatarUrl: avatarUrl,
          },
          'waitlist',
        ); // specific role override

        // Attach a transient property to the user object for the controller to read.
        (user as any).isNewWaitlist = true;

        return user;
      }

      // Check if user is already on the waitlist (returning user)
      const existingUser = await this.usersService.findByEmail(email);
      if (existingUser && existingUser.role === 'waitlist') {
        this.logger.log(`Returning waitlist user login: ${email}`);
        return existingUser;
      }

      this.logger.warn(
        `Login attempt blocked for non-whitelisted email: ${email}`,
      );
      throw new UnauthorizedException(
        'Access Denied: You are not on the invite list.',
      );
    }

    const user = await this.usersService.createOrUpdateGoogleUser({
      googleId: id,
      email: email,
      fullName: displayName,
      avatarUrl: avatarUrl,
    });

    // Log the successful login
    await this.logLogin(user.id, 'google', user.email);
    this.logger.log(`User Logged In via Google: ${user.email} (${user.id})`);

    return user;
  }

  async loginWithFirebase(token: string): Promise<any> {
    try {
      const decoded = await this.firebaseService.verifyIdToken(token);

      if (!decoded.email) {
        throw new UnauthorizedException(
          'Firebase account must have an email address.',
        );
      }

      const user = await this.usersService.createOrUpdateGoogleUser({
        email: decoded.email,
        googleId: decoded.uid, // Firebase UID is the stable ID
        fullName: decoded.name || decoded.email.split('@')[0],
        avatarUrl: decoded.picture || '',
      });

      // Log the successful login
      await this.logLogin(user.id, 'firebase', user.email);
      this.logger.log(
        `User Logged In via Firebase: ${user.email} (${user.id})`,
      );

      return user;
    } catch (err) {
      throw new UnauthorizedException(`Invalid Firebase Token: ${err.message}`);
    }
  }

  async localDevLogin(email: string) {
    // Only for dev/test environments primarily, but widely useful for quick testing
    this.logger.warn(`Dev Login used for ${email}`);
    const user = await this.usersService.createOrUpdateGoogleUser({
      email,
      googleId: `dev-${email}`,
      fullName: 'Dev User',
      avatarUrl: '',
    });
    return this.login(user);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async login(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.full_name,
        avatar: user.avatar_url,
        role: user.role,
      },
    };
  }

  // Audit Log Query
  async getAuthLogs(filter: AuthLogFilterDto) {
    const qb = this.authLogRepo.createQueryBuilder('log');

    if (filter.startDate) {
      qb.andWhere('log.loginAt >= :startDate', { startDate: filter.startDate });
    }
    if (filter.endDate) {
      qb.andWhere('log.loginAt <= :endDate', { endDate: filter.endDate });
    }
    if (filter.userId) {
      qb.andWhere('log.userId = :userId', { userId: filter.userId });
    }
    if (filter.provider) {
      qb.andWhere('log.provider = :provider', { provider: filter.provider });
    }

    qb.orderBy('log.loginAt', 'DESC');
    qb.take(filter.limit || 100);
    qb.skip(filter.offset || 0);

    return qb.getMany();
  }

  private async logLogin(userId: string, provider: string, email?: string) {
    try {
      await this.authLogRepo.save({
        userId,
        provider,
        email,
        loginAt: new Date(),
      });
    } catch (e) {
      console.error('Failed to save auth log', e);
    }
  }
}
