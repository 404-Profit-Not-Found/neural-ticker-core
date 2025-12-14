import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import passport from 'passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  // Removed manual canActivate override to rely on standard NestJS AuthGuard behavior.
  // The parent AuthGuard automatically calls getAuthenticateOptions() and handles the passport flow.
  
  // Note: If we need logging, we can call super.canActivate() and log before/after,
  // but let's try strict standard behavior first to fix the 401.

  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();

    // Capture intent (e.g., 'waitlist') from query query params
    const intent = req.query.intent;
    const state = intent ? JSON.stringify({ intent }) : undefined;

    // Priority: Configured URL > Dynamic Construction
    const configUrl = this.configService.get<string>('google.callbackUrl');
    let callbackURL = configUrl;

    if (!callbackURL) {
      // Trust X-Forwarded-Proto if behind proxy (Cloud Run), otherwise fallback to http
      // Note: main.ts might need 'trust proxy' setting for req.protocol to be accurate
      const performProtocol = req.headers['x-forwarded-proto'];
      const protocol = Array.isArray(performProtocol)
        ? performProtocol[0]
        : performProtocol || req.protocol;
      const host = req.get('host');
      callbackURL = `${protocol}://${host}/api/auth/google/callback`;
    }

    console.log('[GoogleAuthGuard] Generated Options:', { callbackURL, state });

    return {
      callbackURL,
      state,
    };
  }
}
