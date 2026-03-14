import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    // Fallback callback URL - actual URL is set by GoogleAuthGuard.getAuthenticateOptions()
    const callbackURL =
      configService.get<string>('google.callbackUrl') ||
      configService.get<string>('GOOGLE_CALLBACK_URL') ||
      `${configService.get<string>('frontendUrl') || 'http://localhost:3000'}/api/auth/google/callback`;

    super({
      clientID:
        configService.get<string>('GOOGLE_CLIENT_ID') || 'MISSING_CLIENT_ID',
      clientSecret:
        configService.get<string>('GOOGLE_CLIENT_SECRET') || 'MISSING_SECRET',
      callbackURL,
      scope: ['email', 'profile'],
      passReqToCallback: true,
    });
  }

  async validate(
    req: any,
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    try {
      this.logger.debug(
        `Validate called for ${profile.id}: ${JSON.stringify(req.query)}`,
      );

      let intent = null;
      if (req.query.state) {
        try {
          const state = JSON.parse(req.query.state);
          intent = state.intent;
        } catch {
          // ignore invalid state
        }
      }

      const user = await this.authService.validateOAuthLogin(profile, intent);
      done(null, user);
    } catch (err) {
      done(err, false);
    }
  }
}
