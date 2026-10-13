const TICKER_TABS = /^(\/ticker\/[^/]+)(?:\/(?:overview|research|financials|news|social))?\/?$/i;

/**
 * Identity of the page a URL shows. The app shell remounts the page when this
 * changes (so a crashed page recovers on the next navigation) — which is why
 * the tabs of one ticker share a key: they are the same page, and switching
 * them must not rebuild the chart and refetch everything.
 */
export function pageKey(pathname: string): string {
  const ticker = TICKER_TABS.exec(pathname);
  return ticker ? ticker[1].toLowerCase() : pathname;
}
