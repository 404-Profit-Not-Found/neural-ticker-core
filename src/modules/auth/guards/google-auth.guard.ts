import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
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
