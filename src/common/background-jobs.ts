/**
 * Whether THIS PROCESS runs its own scheduled work — every `@Cron` handler in
 * JobsService and MarketDataService asks here before doing anything.
 *
 *  - Production never does: there the same jobs are triggered from outside
 *    (GitHub Actions calling the cron endpoints).
 *  - Everywhere else they run by default, as they always have.
 *  - `BACKGROUND_JOBS=off` switches all of them off. Meant for a local run on
 *    seeded demo data, where the jobs would otherwise overwrite prices from
 *    the live providers, start research runs and fill pending orders.
 *
 * Only the value `off` (any case) does that; unset, or anything else, leaves
 * the behaviour exactly as before. Request-driven work — including the HTTP
 * cron endpoints — is not affected: this gates the in-process schedule only.
 */
export function inProcessJobsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV === 'production') return false;
  return (env.BACKGROUND_JOBS ?? '').trim().toLowerCase() !== 'off';
}
