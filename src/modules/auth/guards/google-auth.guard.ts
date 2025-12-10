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

  async canActivate(context: ExecutionContext): Promise<boolean> {
    console.log('[GoogleAuthGuard] canActivate called via Manual Override');
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    console.log('[GoogleAuthGuard] Incoming Request Query:', request.query);

    const options = this.getAuthenticateOptions(context);
    console.log(
      '[GoogleAuthGuard] Using options:',
      JSON.stringify(options, null, 2),
    );

    // Manually authenticate using passport to ensure options (like state) are respected
    return new Promise<boolean>((resolve, reject) => {
      const authenticateFn = passport.authenticate(
        'google',
        options,
        (err, user) => {
          if (err) {
            console.error('[GoogleAuthGuard] Authentication Error:', err);
            return reject(err instanceof Error ? err : new Error(String(err)));
          }
          if (!user) {
            // If no user and no error, it might be a redirect (phase 1) or failure
            // However, passport.authenticate with a callback DISABLES automatic redirect usually?
            // Wait, if verify callback provided, passport DOES NOT redirect automatically for strategy errors?
            // BUT for the Initial Request (redirect to google), duplicate logic?

            // For Google Strategy:
            // Phase 1 (No code): Redirects.
            // If we provide a callback, does it still redirect?
            // Passport docs: "If a callback is supplied, `authenticate()` keeps `req`, `res`, and `next` in closure...
            // and calls callback when authentication is complete."
            // Use `customCallback` behavior.
            // For 'google' (OAuth2), the redirect happens internally.

            // IF we provide a callback, the redirect might NOT happen automatically?
            // We might need to handle the redirect ourselves if `info` contains it?
            // Or we simply SHOULD NOT provide a callback for Phase 1?

            // Check if this is Phase 1 or 2.
            // Phase 2 has 'code' in query.

            if (request.query.code) {
              // Phase 2: Callback
              console.error(
                '[GoogleAuthGuard] No user found in callback phase',
              );
              return reject(new UnauthorizedException());
            }

            // Phase 1: It should have redirected?
            // If we are here, and no user, and no error... what happened?
            console.log(
              '[GoogleAuthGuard] No user (likely redirecting or failed)',
            );
            return resolve(false); // Don't proceed to controller
          }

          request.user = user;
          resolve(true);
        },
      );

      authenticateFn(request, response, (err: any) => {
        if (err)
          return reject(err instanceof Error ? err : new Error(String(err)));
        return resolve(true);
      });
    });
  }

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
