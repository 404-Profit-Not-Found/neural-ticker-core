import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Soft JWT guard for the MCP endpoint (POST /api/mcp).
 *
 * It runs the standard passport `'jwt'` strategy so that a valid
 * `Authorization: Bearer <token>` header populates `request.user` with the
 * real {@link User} entity — same `JWT_SECRET`, same DB load, same `revoked`
 * block as the rest of the app. Unlike the global `JwtAuthGuard`, it NEVER
 * rejects: an absent or invalid token simply leaves `request.user` undefined
 * and the request proceeds anonymously.
 *
 * This is the "bearer-token passthrough" / soft-auth model: public market and
 * risk tools work without a token, while user-scoped tools enforce auth
 * themselves via `requireUser(req)` (see ./mcp-user.util.ts).
 */
@Injectable()
export class McpSoftAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      // No token, expired token, or revoked user — fall through to anonymous.
    }
    return true;
  }

  /**
   * Override the default passport behaviour (which throws on a missing/invalid
   * user). Return the authenticated user when present, otherwise `undefined`
   * so the request continues without a user attached.
   */
  handleRequest<TUser = any>(_err: any, user: any): TUser {
    return (user || undefined) as TUser;
  }
}
