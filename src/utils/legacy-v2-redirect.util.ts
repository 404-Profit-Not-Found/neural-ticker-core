/**
 * The current web client was served under `/v2/` while it was opt-in; it is
 * now the default at `/`. Old links, bookmarks and installed shortcuts are
 * sent to the same page at the root.
 *
 * `rest` is what follows the `/v2` mount point (`req.url` inside the mounted
 * middleware), e.g. `/ticker/NVDA?tab=news`. The result is ALWAYS a
 * same-origin path: leading slashes and backslashes are collapsed to one
 * slash, so `/v2//evil.example` or `/v2/\\evil.example` can never become a
 * protocol-relative redirect to another site.
 */
export function legacyV2RedirectTarget(rest: string | undefined): string {
  const path = (rest ?? '').replace(/^[/\\]+/, '');
  return `/${path}`;
}
