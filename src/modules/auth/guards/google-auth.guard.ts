import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  getAuthenticateOptions(context: ExecutionContext) {
    // Priority: Configured URL > Dynamic Construction
    const configUrl = this.configService.get<string>('google.callbackUrl');
    if (configUrl) {
      return { callbackURL: configUrl };
    }

    const req = context.switchToHttp().getRequest();
    // Trust X-Forwarded-Proto if behind proxy (Cloud Run), otherwise fallback to http
    // Note: main.ts might need 'trust proxy' setting for req.protocol to be accurate
    const performProtocol = req.headers['x-forwarded-proto'];
    const protocol = Array.isArray(performProtocol)
      ? performProtocol[0]
      : performProtocol || req.protocol;
    const host = req.get('host');
    const callbackURL = `${protocol}://${host}/api/auth/google/callback`;

    return {
      callbackURL,
    };
  }
}
