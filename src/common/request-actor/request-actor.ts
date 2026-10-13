import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * WHO is acting in the current async call chain.
 *
 * A new ticker can be created from a dozen entry points (the ticker reads,
 * watchlist add, research, bulk snapshots, MCP tools, the ADD_TICKER queue…),
 * all of which end in TickersService.ensureTicker(symbol) several calls below
 * the controller. The per-user creation cap is enforced there, so that method
 * has to know the caller — without every service signature in between growing
 * a `user` parameter. RequestActorInterceptor puts the authenticated user of
 * an HTTP / MCP request here; work without a request (crons, the queue worker)
 * has no actor unless it sets one with runWithActor().
 *
 * `null` means "no user": a system job, or an anonymous request.
 */
export interface RequestActor {
  userId: string;
  role: string;
}

const storage = new AsyncLocalStorage<{ actor: RequestActor | null }>();

/** Runs `fn` (and everything it awaits) on behalf of `actor`. */
export function runWithActor<T>(actor: RequestActor | null, fn: () => T): T {
  return storage.run({ actor }, fn);
}

/** The user the current call chain acts for, or null. */
export function currentActor(): RequestActor | null {
  return storage.getStore()?.actor ?? null;
}
