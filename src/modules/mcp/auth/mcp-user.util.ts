import { User } from '../../users/entities/user.entity';

/**
 * Helpers for reading the (optional) authenticated user off the raw Express
 * request that `@rekog/mcp-nest` passes as the 3rd argument to every tool
 * handler. `McpSoftAuthGuard` populates `request.user` when a valid Bearer
 * token is supplied; otherwise it is undefined.
 */

/** Returns the authenticated user, or `undefined` for anonymous callers. */
export function getMcpUser(req: any): User | undefined {
  return (req?.user as User) ?? undefined;
}

/**
 * Returns the authenticated user or throws a clear, client-actionable error.
 * The thrown message is surfaced to the MCP client as a tool error
 * (mcp-nest converts thrown errors into `{ isError: true }` results).
 */
export function requireUser(req: any): User {
  const user = getMcpUser(req);
  if (!user) {
    throw new Error(
      'Authentication required: call this tool with an "Authorization: Bearer <token>" ' +
        'header containing a valid Neural Ticker app JWT.',
    );
  }
  return user;
}

/** True when the user has the `admin` role. */
export function isAdmin(user: User | undefined): boolean {
  return user?.role === 'admin';
}
