import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Identifies the caller on a `@Public()` route WITHOUT requiring a session.
 *
 * The global JwtAuthGuard skips passport entirely for public routes, so
 * `req.user` is never set there — even when the caller is signed in. Add this
 * guard to a public handler that answers everyone but shows a signed-in caller
 * more (e.g. their own moderated comments): a valid cookie / bearer token
 * populates `req.user` through the normal `jwt` strategy (same secret, same
 * `revoked` block); a missing, expired or invalid one leaves it undefined and
 * the request proceeds anonymously. It never rejects.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      // No / expired / invalid token, or a revoked user: anonymous.
    }
    return true;
  }

  handleRequest<TUser = any>(_err: any, user: any): TUser {
    return (user || undefined) as TUser;
  }
}
